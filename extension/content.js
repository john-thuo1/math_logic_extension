/*
 * MathLogic inline controller — the "Grammarly for math" part.
 *
 * Watches whatever text box you type in (textarea, input, or rich
 * contenteditable editors such as ChatGPT / Claude / Gemini composers) and:
 *   • \trigger      → suggestion popup (Tab/Enter to insert, Space to accept exact match)
 *   • templates     → inserted with ⬚ placeholders, Tab jumps to the next one
 *   • smart ops     → -> ≤ != ^2 x_1 become → ≤ ≠ ² x₁ as you type (Unicode/Auto)
 *   • /math phrase  → Enter or Tab converts plain English to notation
 *   • select + Alt+M → converts the selected text
 *
 * Runs as the extension content script, and is reused by the website demo and
 * the extension's options page (they construct MathLogicController themselves).
 */
(function (root) {
  'use strict';
  var E = root.MathLogicEngine;
  if (!E) return;
  var PH = E.PH;
  // Typing must stay cheap on a long document, so whole-text scans stop here.
  var SCAN_LIMIT = 20000;
  var T = E.TIMING;
  var TRIGGER_RE = /(?:^|[^\\])\\([A-Za-z][A-Za-z0-9*]*)$/;   // "\name" (a "\\" escape never triggers)
  // Symbols that attach to what follows (∀x, ∃y, ¬p, ∇f, √2): Space after them is swallowed.
  var ATTACHING = { forall: 1, exists: 1, nexists: 1, existsone: 1, not: 1, nabla: 1, partial: 1, sqrt: 1, cbrt: 1, next: 1, always: 1, eventually: 1, box: 1, diamond: 1 };
  var MATH_RE = /(^|\s)\/math\s+(\S.*)$/;
  var BLOCK_TAGS = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH|SECTION|ARTICLE)$/;
  var CODE_EDITOR = /CodeMirror|cm-content|monaco|ace_text|ace_editor/;

  // ---------------------------------------------------------------------------
  // Editable helpers
  // ---------------------------------------------------------------------------
  function editableFrom(target) {
    if (!target || target.nodeType !== 1) {
      if (target && target.parentElement) target = target.parentElement; else return null;
    }
    if (target.closest && target.closest('[data-mathlogic-off]')) return null;
    if (target.tagName === 'TEXTAREA') return { el: target, type: 'text' };
    if (target.tagName === 'INPUT') {
      var t = (target.getAttribute('type') || 'text').toLowerCase();
      return /^(text|search|url)$/.test(t) ? { el: target, type: 'text' } : null;
    }
    if (target.isContentEditable) {
      var host = target;
      while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
      return { el: host, type: 'ce' };
    }
    return null;
  }

  function isCodeContext(ed) {
    var cls = (ed.el.className && ed.el.className.baseVal !== undefined) ? ed.el.className.baseVal : (ed.el.className || '');
    if (CODE_EDITOR.test(cls)) return true;
    if (ed.type === 'ce') {
      var sel = window.getSelection();
      var n = sel && sel.focusNode;
      var el = n && (n.nodeType === 1 ? n : n.parentElement);
      if (el && el.closest && el.closest('code, pre')) return true;
    }
    return false;
  }

  function closestBlock(node, rootEl) {
    var n = node.nodeType === 1 ? node : node.parentNode;
    while (n && n !== rootEl) {
      if (n.nodeType === 1 && BLOCK_TAGS.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return rootEl;
  }

  function caretTextPos(rootEl) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var node = sel.focusNode, off = sel.focusOffset;
    if (!node || !rootEl.contains(node)) return null;
    if (node.nodeType === 3) return { node: node, off: off };
    // Caret between element children: use the end of the previous text node.
    var prev = off > 0 ? node.childNodes[off - 1] : null;
    var tw = document.createTreeWalker(prev || node, NodeFilter.SHOW_TEXT);
    var last = null, cur;
    if (prev) { while ((cur = tw.nextNode())) last = cur; if (prev.nodeType === 3) last = prev; }
    if (last) return { node: last, off: last.data.length };
    return { node: node, off: off, element: true };
  }

  function prevText(rootEl, node) {
    var tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    tw.currentNode = node;
    return tw.previousNode();
  }

  function walkBack(rootEl, pos, n) {
    var node = pos.node, off = pos.off;
    while (n > off) {
      n -= off;
      node = prevText(rootEl, node);
      if (!node) return null;
      off = node.data.length;
    }
    return { node: node, off: off - n };
  }

  function findForward(rootEl, node, off, ch) {
    var tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    var cur = node;
    if (node.nodeType !== 3) { tw.currentNode = node; cur = tw.nextNode(); off = 0; }
    else tw.currentNode = node;
    while (cur) {
      var i = cur.data.indexOf(ch, off);
      if (i >= 0) return { node: cur, off: i };
      cur = tw.nextNode();
      off = 0;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Popup (shadow DOM so the host page's CSS can't break it)
  // ---------------------------------------------------------------------------
  var CSS = [
    ':host{all:initial;pointer-events:none}',
    '.box{pointer-events:auto;position:fixed;z-index:2147483647;width:300px;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;',
    'box-shadow:0 12px 40px rgba(15,23,42,.18);font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}',
    '.hd{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f8fafc;border-bottom:1px solid #eef2f7;',
    'font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}',
    '.mode{background:#eef2ff;color:#4338ca;border-radius:6px;padding:1px 6px}',
    '.it{display:flex;align-items:center;gap:10px;padding:6px 10px;cursor:pointer}',
    '.it.on{background:#4f46e5;color:#fff}',
    '.g{min-width:34px;height:30px;padding:0 4px;border-radius:7px;display:flex;align-items:center;justify-content:center;',
    'font:18px "Cambria Math","STIX Two Math","Latin Modern Math","Times New Roman",serif;background:#f1f5f9;color:#4338ca;white-space:nowrap;overflow:hidden;max-width:70px}',
    '.g.sm{font:600 11px system-ui,-apple-system,sans-serif;letter-spacing:.02em;min-width:44px}',
    '.it.on .g{background:rgba(255,255,255,.18);color:#fff}',
    '.tx{flex:1;min-width:0}',
    '.t{font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}',
    '.n{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.it.on .n{color:#e0e7ff}',
    '.pv{padding:7px 10px;border-top:1px solid #eef2f7;background:#fafbff;font-size:11.5px;line-height:1.4;color:#334155;max-height:96px;overflow:hidden}',
    '.pv .ins{font:13px "Cambria Math","STIX Two Math","Latin Modern Math","DejaVu Sans",serif;color:#312e81;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}',
    '.pv .hint{color:#475569}',
    '.ft{padding:5px 10px;border-top:1px solid #eef2f7;font-size:10.5px;color:#94a3b8;background:#fcfdfe}',
    'kbd{font:10px ui-monospace,monospace;background:#f1f5f9;border:1px solid #e2e8f0;border-bottom-width:2px;border-radius:4px;padding:0 4px;color:#334155}',
    '.chk{pointer-events:auto;position:fixed;z-index:2147483647;max-width:320px;padding:6px 10px;border-radius:9px;background:#fffbeb;color:#92400e;',
    'border:1px solid #fcd34d;font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 20px rgba(146,64,14,.18)}',
    '.chk b{font-weight:600}.chk span{opacity:.75}',
    '.chk .scope{display:block;margin-top:2px;font-size:11px;opacity:.65}',
    '.chk.semantic{background:#eff6ff;color:#1e40af;border-color:#93c5fd}',
    '.chk.style{background:#f8fafc;color:#475569;border-color:#cbd5e1}',
    '.toast{position:fixed;z-index:2147483647;max-width:360px;padding:7px 11px;border-radius:9px;background:#0f172a;color:#f8fafc;',
    'font:12.5px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.25)}',
    '.toast.err{background:#991b1b}',
    '@media (prefers-color-scheme: dark){.box{background:#1e1e24;color:#e5e7eb;border-color:#33333d}.hd,.ft{background:#18181d;border-color:#2a2a33}',
    '.pv{background:#1b1b22;border-color:#2a2a33;color:#d1d5db}.pv .ins{color:#c7d2fe}.pv .hint{color:#9ca3af}',
    '.chk{background:#2a2113;color:#fcd34d;border-color:#7c5e17}',
    '.chk.semantic{background:#13203a;color:#93c5fd;border-color:#1e3a8a}.chk.style{background:#20232b;color:#cbd5e1;border-color:#3f4654}',
    '.g{background:#2a2a33;color:#a5b4fc}.n{color:#9ca3af}.mode{background:#312e81;color:#c7d2fe}kbd{background:#2a2a33;border-color:#3f3f4a;color:#e5e7eb}}'
  ].join('');

  function Controller(opts) {
    this.getSettings = opts.getSettings;
    this.ai = opts.ai || null;
    this.scope = opts.scope || null;
    this.hostname = opts.hostname || location.hostname;
    this.items = [];
    this.sel = 0;
    this.open = false;
    this.ed = null;
    this.dismissed = null; // {el, key}: the \word the user pressed Esc on
    this.busy = false;
    this._onKey = this.guard(this.onKeyDown);
    this._onInput = this.guard(this.onInput);
    this._onDown = this.guard(this.onMouseDown);
    this._onBlur = this.guard(this.onBlur);
    this._onScroll = this.guard(this.onScroll);
  }

  /**
   * Host pages are not ours to break. If a handler throws, drop our own UI and
   * let the event run its normal course.
   */
  Controller.prototype.guard = function (fn) {
    var self = this;
    return function (e) {
      try {
        return fn.call(self, e);
      } catch (err) {
        try { self.close(); self.hideCheck(); self.busy = false; self.pending = null; } catch (ignored) {}
        if (typeof console !== 'undefined' && console.error) console.error('Math Logic:', err);
      }
    };
  };

  Controller.prototype.start = function () {
    window.addEventListener('keydown', this._onKey, true);
    document.addEventListener('input', this._onInput, true);
    document.addEventListener('mousedown', this._onDown, true);
    document.addEventListener('focusout', this._onBlur, true);
    window.addEventListener('resize', this._onScroll);
    window.addEventListener('scroll', this._onScroll, true); // chat composers scroll internally as they grow
    return this;
  };
  Controller.prototype.stop = function () {
    window.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('input', this._onInput, true);
    document.removeEventListener('mousedown', this._onDown, true);
    document.removeEventListener('focusout', this._onBlur, true);
    window.removeEventListener('resize', this._onScroll);
    window.removeEventListener('scroll', this._onScroll, true);
    clearTimeout(this._chkTimer);
    clearTimeout(this._toastTimer);
    this.stopped = true;
    this.pending = null;
    this.dismissed = null;
    this.quiet = null;
    this.chkMuted = null;
    this.close();
    this.hideCheck();
    this.ed = null;
    if (this.host) this.host.remove();
  };

  // Defaults and validation happen here, once, so nothing downstream restates them.
  Controller.prototype.settings = function () {
    var s = this.getSettings();
    if (!s) return E.DEFAULT_SETTINGS;
    if (s !== this._rawSettings) {
      this._rawSettings = s;
      this._settings = E.normalizeSettings(s);
    }
    return this._settings;
  };
  Controller.prototype.active = function () {
    var s = this.settings();
    return s.enabled !== false && (s.disabledSites || []).indexOf(this.hostname) < 0;
  };
  Controller.prototype.custom = function () {
    var s = this.settings();
    if (this._customSrc !== s.customSnippets) {
      this._customSrc = s.customSnippets;
      this._custom = E.parseCustomSnippets(s.customSnippets);
    }
    return this._custom;
  };

  Controller.prototype.edFromEvent = function (e) {
    var t = e.composedPath ? e.composedPath()[0] : e.target;
    var ed = editableFrom(t);
    if (!ed && document.activeElement) ed = editableFrom(document.activeElement);
    if (ed && this.scope && !this.scope.contains(ed.el)) return null;
    return ed;
  };

  // ------------------------------------------------------------------ reading
  Controller.prototype.before = function (ed) {
    if (ed.type === 'text') {
      var el = ed.el;
      if (el.selectionStart == null || el.selectionStart !== el.selectionEnd) return null;
      var v = el.value.slice(0, el.selectionStart);
      return v.slice(v.lastIndexOf('\n') + 1);
    }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !ed.el.contains(sel.focusNode)) return null;
    var block = closestBlock(sel.focusNode, ed.el);
    var r = document.createRange();
    try {
      r.setStart(block, 0);
      r.setEnd(sel.focusNode, sel.focusOffset);
    } catch (err) { return null; }
    return r.toString().replace(/ /g, ' ');
  };

  // ------------------------------------------------------------------ writing
  function execInsert(text) {
    try {
      if (text === '') return document.execCommand('delete', false);
      return document.execCommand('insertText', false, text);
    } catch (e) { return false; }
  }

  /** Replace the n characters before the caret with text. */
  Controller.prototype.replaceBefore = function (ed, n, text) {
    this.busy = true;
    try {
      if (ed.type === 'text') {
        var el = ed.el, pos = el.selectionStart;
        el.setSelectionRange(pos - n, pos);
        if (!execInsert(text)) {
          el.setRangeText(text, pos - n, pos, 'end');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }
      var caret = caretTextPos(ed.el);
      if (!caret) return false;
      var start = n ? walkBack(ed.el, caret, n) : caret;
      if (!start) return false;
      var sel = window.getSelection();
      var range = document.createRange();
      range.setStart(start.node, start.off);
      if (caret.element) range.setEnd(caret.node, caret.off); else range.setEnd(caret.node, caret.off);
      sel.removeAllRanges();
      sel.addRange(range);
      if (!execInsert(text)) {
        range.deleteContents();
        var tn = document.createTextNode(text);
        range.insertNode(tn);
        range.setStartAfter(tn);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        ed.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      return true;
    } finally {
      this.busy = false;
    }
  };

  /**
   * Multi-line blocks (diagrams, tables) in rich editors: hand them to the editor as a
   * paste, which ProseMirror/Quill turn into proper lines. Plain contenteditable gets
   * line breaks inserted one by one.
   *
   * The trigger text is selected first and the paste happens on the next tick, so the
   * editor has synced its own idea of the selection (ProseMirror syncs on
   * 'selectionchange', which fires asynchronously) and replaces exactly the trigger.
   */
  Controller.prototype.insertMultilineCE = function (ed, n, text, done) {
    var sel = window.getSelection();
    var caret = caretTextPos(ed.el);
    if (!caret) return false;
    var start = n ? walkBack(ed.el, caret, n) : caret;
    if (!start) return false;
    var rg = document.createRange();
    rg.setStart(start.node, start.off);
    rg.setEnd(caret.node, caret.off);
    sel.removeAllRanges();
    sel.addRange(rg);
    var self = this;
    setTimeout(function () {
      self.busy = true;
      try {
        var handled = false;
        try {
          var dt = new DataTransfer();
          dt.setData('text/plain', text);
          var ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
          var tgt = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement);
          (tgt || ed.el).dispatchEvent(ev);
          handled = ev.defaultPrevented;
        } catch (err) { handled = false; }
        if (!handled) {
          text.split('\n').forEach(function (line, i) {
            if (i && !document.execCommand('insertLineBreak')) document.execCommand('insertParagraph');
            if (line) execInsert(line);
            else if (i === 0 && !sel.isCollapsed) execInsert(''); // remove the trigger
          });
        }
      } finally {
        self.busy = false;
      }
      // editors apply pastes synchronously, but let their DOM settle before selecting
      setTimeout(done, T.settle);
    }, T.settle);
    return true;
  };

  /** Select the first box of a block that was just inserted and has k boxes. */
  Controller.prototype.selectFirstOfLast = function (ed, k) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var caretRange = sel.getRangeAt(0);
    var tw = document.createTreeWalker(ed.el, NodeFilter.SHOW_TEXT);
    var hits = [], node;
    while ((node = tw.nextNode())) {
      for (var i = node.data.indexOf(PH); i >= 0; i = node.data.indexOf(PH, i + 1)) {
        if (caretRange.comparePoint(node, i) <= 0) hits.push({ node: node, off: i });
      }
    }
    var h = hits[hits.length - k];
    if (!h) return;
    var r = document.createRange();
    r.setStart(h.node, h.off);
    r.setEnd(h.node, h.off + 1);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  /** Insert text (replacing n chars before caret); select first placeholder if any. */
  Controller.prototype.insert = function (ed, n, text) {
    if (text.indexOf('\n') >= 0) {
      // a ``` fence only counts at the start of a line
      var lineBefore = (this.before(ed) || '');
      lineBefore = lineBefore.slice(0, Math.max(0, lineBefore.length - n));
      if (/^```/.test(text) && /\S/.test(lineBefore) && ed.el.tagName !== 'INPUT') text = '\n' + text;
      if (ed.el.tagName === 'INPUT') text = text.replace(/\n\s*/g, ' '); // single-line box
      else if (ed.type === 'ce') {
        var k = text.split(PH).length - 1, self = this;
        // The block lands on the next tick. Keys typed meanwhile are held and
        // replayed, so fast typing never lands in half-inserted text.
        this.pending = { el: ed.el, keys: [] };
        var ok = this.insertMultilineCE(ed, n, text, function () {
          if (k) self.selectFirstOfLast(ed, k);
          var keys = self.pending ? self.pending.keys : [];
          self.pending = null;
          keys.forEach(function (key) {
            if (key === 'Tab') self.nextPlaceholder(ed);
            else if (!self.fillSlot(ed, key)) execInsert(key);
          });
        });
        if (!ok) this.pending = null;
        return;
      }
    }
    var startIdx = ed.type === 'text' ? ed.el.selectionStart - n : null;
    if (!this.replaceBefore(ed, n, text)) return;
    if (text.indexOf(PH) < 0) return;
    if (ed.type === 'text') {
      var i = ed.el.value.indexOf(PH, startIdx);
      if (i >= 0) ed.el.setSelectionRange(i, i + 1);
      return;
    }
    var caret = caretTextPos(ed.el);
    var from = caret && walkBack(ed.el, caret, text.length);
    if (from) this.selectPlaceholderFrom(ed, from.node, from.off);
  };

  Controller.prototype.selectPlaceholderFrom = function (ed, node, off) {
    var hit = findForward(ed.el, node, off, PH);
    if (!hit) return false;
    var r = document.createRange();
    r.setStart(hit.node, hit.off);
    r.setEnd(hit.node, hit.off + 1);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  };

  /**
   * The ⬚ the user is typing into: the selected box, or a box directly touching a
   * collapsed caret (after it first, then before it). Returns null if none.
   */
  Controller.prototype.slotAtCaret = function (ed) {
    if (ed.type === 'text') {
      var el = ed.el, v = el.value, a = el.selectionStart, b = el.selectionEnd;
      if (a == null) return null;
      if (b - a === 1 && v[a] === PH) return { a: a, b: b };
      if (a !== b) return null;
      if (v[a] === PH) return { a: a, b: a + 1 };
      if (a > 0 && v[a - 1] === PH) return { a: a - 1, b: a };
      return null;
    }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var rg = sel.getRangeAt(0);
    if (!ed.el.contains(rg.startContainer)) return null;
    if (!rg.collapsed) return rg.toString() === PH ? rg.cloneRange() : null;
    var caret = caretTextPos(ed.el);
    if (!caret || caret.element) return null;
    var r = document.createRange();
    var hit = findForward(ed.el, caret.node, caret.off, PH);
    if (hit) {
      var gap = document.createRange();
      gap.setStart(caret.node, caret.off);
      gap.setEnd(hit.node, hit.off);
      if (gap.toString() === '') { r.setStart(hit.node, hit.off); r.setEnd(hit.node, hit.off + 1); return r; }
    }
    var back = walkBack(ed.el, caret, 1);
    if (back && back.node.data[back.off] === PH) { r.setStart(back.node, back.off); r.setEnd(back.node, back.off + 1); return r; }
    return null;
  };

  /** Replace the ⬚ at the caret with the typed character. Returns true if it did. */
  Controller.prototype.fillSlot = function (ed, ch) {
    if (!this.hasPlaceholder(ed)) return false; // fast path: no boxes in this editor
    var slot = this.slotAtCaret(ed);
    if (!slot) return false;
    this.busy = true;
    try {
      if (ed.type === 'text') {
        ed.el.setSelectionRange(slot.a, slot.b);
        if (!execInsert(ch)) {
          ed.el.setRangeText(ch, slot.a, slot.b, 'end');
          ed.el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(slot);
        if (!execInsert(ch)) {
          slot.deleteContents();
          var tn = document.createTextNode(ch);
          slot.insertNode(tn);
          slot.setStartAfter(tn);
          slot.collapse(true);
          sel.removeAllRanges();
          sel.addRange(slot);
          ed.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
        }
      }
    } finally {
      this.busy = false;
    }
    var self = this;
    setTimeout(function () { self.refresh(ed); }, T.settle); // e.g. "\" typed into a box starts a suggestion
    return true;
  };

  Controller.prototype.hasPlaceholder = function (ed) {
    var all = ed.type === 'text' ? ed.el.value : (ed.el.textContent || '');
    return all.length <= SCAN_LIMIT && all.indexOf(PH) >= 0;
  };

  /** Tab: jump to next ⬚ (wrapping). Returns true if one was selected. */
  Controller.prototype.nextPlaceholder = function (ed) {
    if (ed.type === 'text') {
      var el = ed.el, v = el.value;
      if (v.indexOf(PH) < 0) return false;
      var i = v.indexOf(PH, el.selectionEnd);
      if (i < 0) i = v.indexOf(PH);
      el.setSelectionRange(i, i + 1);
      return true;
    }
    if ((ed.el.textContent || '').indexOf(PH) < 0) return false;
    var sel = window.getSelection();
    var rg = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (rg && ed.el.contains(rg.endContainer) && this.selectPlaceholderFrom(ed, rg.endContainer, rg.endOffset)) return true;
    return this.selectPlaceholderFrom(ed, ed.el, 0);
  };

  // ------------------------------------------------------------------ events
  Controller.prototype.onKeyDown = function (e) {
    if (this.busy || e.isComposing || e.keyCode === 229) return;
    if (this.pending) {
      if (e.ctrlKey || e.metaKey || /^(Shift|Alt|Control|Meta|CapsLock)$/.test(e.key)) return;
      if (e.key !== 'Tab' && (!e.key || e.key.length !== 1)) return; // Enter and friends stay the page's
      this.pending.keys.push(e.key);
      return stop(e);
    }
    if (!this.active()) { this.close(); return; }
    var ed = this.edFromEvent(e);
    if (!ed) { this.close(); return; }
    var s = this.settings();
    var mode = s.mode;

    // An Esc-dismissal only lasts while the user keeps typing that same word.
    // Any other key (Backspace, arrows, Ctrl+A, space…) ends it — editors like
    // ProseMirror delete without firing 'input', so we can't rely on that alone.
    var commitKey = e.key === ' ' || /^[,.;:)\]}!?^_\/(+\-=*<>|]$/.test(e.key);
    var keepsDismissal = e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab' ||
      /^(Shift|Alt|Control|Meta|CapsLock)$/.test(e.key) ||
      (e.key.length === 1 && /[A-Za-z0-9*]/.test(e.key) && !e.ctrlKey && !e.metaKey);
    if (this.dismissed && !commitKey && !keepsDismissal) this.dismissed = null;

    // 1. popup navigation — always re-sync with the text first, so fast typists
    //    never accept a stale suggestion.
    var navKey = e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape';
    if (navKey && !e.altKey && !e.ctrlKey && !e.metaKey) this.refresh(ed, true);
    if (this.open && this.ed && this.ed.el === ed.el) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : this.items.length - 1)) % this.items.length;
        this.render();
        return stop(e);
      }
      if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey)) {
        this.accept(ed, this.items[this.sel]);
        return stop(e);
      }
      if (e.key === 'Escape') {
        this.dismissed = { el: ed.el, key: this.anchorKey(ed) };
        this.close();
        return stop(e);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        this.quiet = ed.el; // the caret moved on purpose: stay closed until typing resumes
        this.close();
      }
    }

    // 1b. Esc with no popup open dismisses a bracket warning until the line is fixed
    if (e.key === 'Escape' && !this.open && this.chkIssue) {
      this.chkMuted = ed.el;
      this.hideCheck();
      return; // Esc is not swallowed: the page may need it too
    }

    // 2. Alt/Option+M → convert selection or pending /math
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyM' || e.key === 'm' || e.key === 'µ')) {
      // On a Mac keyboard Option+M is how you type µ, so when there is nothing to
      // convert we leave that key alone instead of swallowing it.
      if (e.key === 'µ' && !this.hasSomethingToConvert(ed)) return;
      stop(e);
      this.convertCommand(ed, true);
      return;
    }

    // 2b. Typing into a ⬚ slot always replaces the box. Some chat editors collapse
    //     the selection we put on the ⬚ to one side of it, which would otherwise
    //     leave "1⬚" or "⬚3" behind, so we do the replacement ourselves.
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && this.fillSlot(ed, e.key)) return stop(e);

    var before = this.before(ed);
    if (before == null) {
      if (e.key === 'Tab' && !e.shiftKey && this.nextPlaceholder(ed)) return stop(e);
      return;
    }
    var inCode = this.inCode(ed, before);
    var unicodeish = mode === 'UNICODE' || mode === 'AUTO';

    // 3. Space / punctuation right after an exact \trigger → accept it
    if (commitKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var m = !inCode && TRIGGER_RE.exec(before);
      var wasDismissed = this.isDismissed(ed);
      this.dismissed = null; // the word ends here either way
      if (m && !wasDismissed) {
        var exact = E.findExact(m[1], this.custom());
        if (exact) {
          this.close();
          var out = E.renderEntry(exact, mode, s.target);
          if (exact.kind === 'template' || out.indexOf(PH) >= 0) {
            if (e.key !== ' ') return; // "\frac," is probably literal text
            this.insert(ed, m[1].length + 1, out);
            return stop(e);
          }
          this.replaceBefore(ed, m[1].length + 1, out);
          if (e.key === ' ' && unicodeish && ATTACHING[exact.trigger]) return stop(e); // ∀x, not ∀ x
          return; // let the space / punctuation through
        }
      }
    }

    // 4. Enter / Tab with a pending "/math …"
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && MATH_RE.test(before)) {
      stop(e);
      this.convertCommand(ed, false);
      return;
    }

    // 5. Enter sends the message: finish a pending x^2 / -> first so what's sent is final.
    if (e.key === 'Enter' && !e.shiftKey && s.smartOps !== false && unicodeish && !inCode && !TRIGGER_RE.test(before)) {
      var fin = E.smartOperator(before, undefined);
      if (fin) this.replaceBefore(ed, fin.remove, fin.insert);
      return; // never block Enter here
    }

    // 6. Tab → next placeholder (finishing a pending x^2 in the current slot first)
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!this.hasPlaceholder(ed)) return; // normal Tab behaviour
      if (s.smartOps !== false && unicodeish && !inCode) {
        var finT = E.smartOperator(before, undefined);
        if (finT) this.replaceBefore(ed, finT.remove, finT.insert);
      }
      if (this.nextPlaceholder(ed)) return stop(e);
      return;
    }

    // 7. Smart operators / super- & subscripts, just before a normal char is typed
    if (s.smartOps !== false && unicodeish && e.key && e.key.length === 1 &&
        !e.ctrlKey && !e.metaKey && !inCode && !MATH_RE.test(before) && !TRIGGER_RE.test(before)) {
      var r = E.smartOperator(before, e.key);
      if (r) this.replaceBefore(ed, r.remove, r.insert);
    }
  };

  /** Text from the start of the editable to the caret (for ``` fence counting). */
  Controller.prototype.beforeAll = function (ed) {
    if (ed.type === 'text') return ed.el.value.slice(0, ed.el.selectionStart);
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !ed.el.contains(sel.focusNode)) return '';
    var r = document.createRange();
    try { r.setStart(ed.el, 0); r.setEnd(sel.focusNode, sel.focusOffset); } catch (err) { return ''; }
    return r.toString();
  };

  /** Inside a code editor, <code>/<pre>, a ``` fence, or an open `inline code` span? */
  Controller.prototype.inCode = function (ed, before) {
    if (isCodeContext(ed)) return true;
    var all = ed.type === 'text' ? ed.el.value : (ed.el.textContent || '');
    if (all.length > SCAN_LIMIT) all = '';
    if (all.indexOf('```') >= 0 && ((this.beforeAll(ed) || '').match(/```/g) || []).length % 2 === 1) return true;
    var line = (before || '').replace(/```/g, '');
    return ((line.match(/`/g) || []).length % 2) === 1;
  };

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  Controller.prototype.isDismissed = function (ed) {
    return !!this.dismissed && this.dismissed.el === ed.el && this.dismissed.key === this.anchorKey(ed);
  };

  Controller.prototype.anchorKey = function (ed) {
    var b = this.before(ed) || '';
    var m = TRIGGER_RE.exec(b);
    return m ? (b.length - m[1].length) + ':' + b.slice(0, b.length - m[1].length) : null;
  };

  Controller.prototype.onInput = function (e) {
    if (this.busy) return;
    if (!this.active()) return;
    var ed = this.edFromEvent(e);
    if (!ed) { this.close(); return; }
    var self = this;
    this.quiet = null; // real typing: suggestions are welcome again
    // Let rich editors (ProseMirror, Quill…) settle the DOM first.
    setTimeout(function () { self.refresh(ed); }, T.settle);
    this.scheduleCheck(ed);
  };

  Controller.prototype.refresh = function (ed, fromKey) {
    // A key press may re-sync an open popup, but only typing reopens a closed one.
    if (fromKey && !this.open && this.quiet === ed.el) return;
    var before = this.before(ed);
    var m = before != null && TRIGGER_RE.exec(before);
    if (!m) { this.close(); this.dismissed = null; return; }
    if (this.inCode(ed, before)) { this.close(); return; }
    if (this.isDismissed(ed)) return;
    this.dismissed = null;
    if (fromKey && this.open && this.query === m[1] && this.ed && this.ed.el === ed.el) return;
    var items = E.getSuggestions(m[1], { custom: this.custom(), limit: 7 });
    if (!items.length) { this.close(); return; }
    this.items = items;
    this.sel = 0;
    this.ed = ed;
    this.query = m[1];
    this.open = true;
    this.render();
  };

  Controller.prototype.accept = function (ed, item) {
    if (!item) return;
    var before = this.before(ed) || '';
    var m = TRIGGER_RE.exec(before);
    var n = m ? m[1].length + 1 : 0;
    var mode = this.settings().mode;
    var out = E.renderEntry(item, mode, this.settings().target);
    if (mode === 'LATEX' && item.kind === 'symbol' && /[A-Za-z}]$/.test(out)) out += ' ';
    this.close();
    this.insert(ed, n, out);
  };

  /** Keep the popup glued to the caret when the page or the composer scrolls. */
  Controller.prototype.onScroll = function () {
    this.positionCheck();
    if (!this.open || !this.ed || !this.box) return;
    this.position(this.box); // scroll events already arrive at most once per frame
  };

  Controller.prototype.onMouseDown = function (e) {
    if (!this.open) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (this.host && path.indexOf(this.host) >= 0) return;
    this.close();
  };
  Controller.prototype.onBlur = function () {
    var self = this;
    setTimeout(function () {
      self.hideCheck();
      if (self.open && self.ed && document.activeElement !== self.ed.el && !(self.ed.el.contains && self.ed.el.contains(document.activeElement))) self.close();
    }, T.blur);
  };

  // ------------------------------------------------------------------ /math
  Controller.prototype.convertCommand = function (ed, fromShortcut) {
    var self = this;
    var s = this.settings();
    var mode = s.mode;
    var phrase, apply;

    var selText = '';
    if (ed.type === 'text') selText = ed.el.value.slice(ed.el.selectionStart, ed.el.selectionEnd);
    else { var sl = window.getSelection(); selText = sl && !sl.isCollapsed ? sl.toString() : ''; }

    if (fromShortcut && selText.trim()) {
      phrase = selText.trim();
      apply = function (out) {
        var cur = ed.type === 'text' ? ed.el.value.slice(ed.el.selectionStart, ed.el.selectionEnd) : window.getSelection().toString();
        if (cur.trim() !== phrase) return self.toast('Selection changed — conversion skipped', true);
        self.busy = true;
        try {
          if (!execInsert(out) && ed.type === 'text') {
            ed.el.setRangeText(out, ed.el.selectionStart, ed.el.selectionEnd, 'end');
            ed.el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } finally { self.busy = false; }
      };
    } else {
      var before = this.before(ed) || '';
      var m = MATH_RE.exec(before);
      if (!m) {
        if (fromShortcut) this.toast('Select some text (or type “/math your phrase”) then press Alt+M');
        return;
      }
      phrase = m[2].trim();
      var cmdLen = m[0].length - m[1].length;
      apply = function (out) {
        var b2 = self.before(ed) || '';
        var m2 = MATH_RE.exec(b2);
        if (!m2 || m2[2].trim() !== phrase) return self.toast('Text changed — conversion skipped', true);
        self.replaceBefore(ed, cmdLen, out);
      };
    }

    var delims = E.delimsFor(this.hostname, s.latexDelims);
    var offline = E.convertOffline(phrase, mode, { wrapLatex: s.wrapLatex !== false, delims: delims });
    var ai = s.ai || {};
    var canAI = !!this.ai && E.aiReady(ai);
    if (canAI && (!offline.confident || ai.preferAI)) {
      this.toast('Converting with AI…');
      this.ai(phrase, mode).then(function (text) {
        var looksLatex = mode === 'LATEX' || (mode === 'AUTO' && /\\[A-Za-z]/.test(text));
        if (looksLatex && s.wrapLatex !== false) text = E.wrapMath(text, delims);
        apply(text);
        self.toast('Converted with AI ✓');
      }, function (err) {
        apply(offline.text);
        self.toast('AI unavailable (' + (err && err.message || err) + ') — used offline converter', true);
      });
      return;
    }
    apply(offline.text);
    if (!offline.confident) {
      this.toast(canAI ? 'Converted offline' : 'Converted offline — some words weren’t understood (' + offline.leftover.slice(0, 3).join(', ') + '). You can turn on AI conversion in Settings for tricky phrases.', !canAI);
    }
  };

  // ------------------------------------------------- bracket check (passive)
  /** The line the caret is on, which is what the bracket check looks at. */
  Controller.prototype.caretLine = function (ed) {
    if (ed.type === 'text') {
      var all = ed.el.value || '';
      if (all.length > SCAN_LIMIT) return '';
      var idx = ed.el.selectionEnd;
      var start = all.lastIndexOf('\n', Math.max(0, idx - 1)) + 1;
      var end = all.indexOf('\n', idx);
      return all.slice(start, end < 0 ? all.length : end);
    }
    // textContent has no newlines, so in a rich editor the caret's block is the line.
    var sel = window.getSelection();
    var node = sel && sel.focusNode;
    if (!node || !ed.el.contains(node)) return '';
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== ed.el) {
      var d = getComputedStyle(el).display;
      if (d && d.indexOf('inline') !== 0) break;
      el = el.parentElement;
    }
    var text = ((el || ed.el).textContent || '');
    return text.length > SCAN_LIMIT ? '' : text;
  };

  /** Is there a selection, or a pending "/math …", for Alt+M to work on? */
  Controller.prototype.hasSomethingToConvert = function (ed) {
    var selected = ed.type === 'text'
      ? ed.el.selectionEnd > ed.el.selectionStart
      : String(window.getSelection() || '').length > 0;
    return selected || MATH_RE.test(this.before(ed) || '');
  };

  Controller.prototype.scheduleCheck = function (ed) {
    var self = this;
    // Balance is cheap to test, so it runs on every keystroke. The warning goes
    // the moment the line is fixed, and an Esc-dismissal ends there too.
    if ((this.chkMuted === ed.el || this.chkIssue) && !E.checkFormula(this.caretLine(ed), { target: this.settings().target })) {
      if (this.chkMuted === ed.el) this.chkMuted = null;
      this.hideCheck();
    }
    clearTimeout(this._chkTimer);
    this._chkTimer = setTimeout(function () { self.runCheck(ed); }, this.checkDelay || T.check);
  };

  /** Report, never block and never rewrite. */
  Controller.prototype.runCheck = function (ed) {
    if (this.settings().bracketCheck === false || !this.active() || this.open) return this.hideCheck();
    if (!ed || !ed.el.isConnected || document.activeElement !== ed.el && !(ed.el.contains && ed.el.contains(document.activeElement))) return this.hideCheck();
    var line = this.caretLine(ed);
    if (this.inCode(ed, this.before(ed) || '')) return this.hideCheck();
    var issue = E.checkFormula(line, { target: this.settings().target });
    if (!issue) { this.chkMuted = null; return this.hideCheck(); }
    if (this.chkMuted === ed.el) return; // dismissed with Esc until the line is balanced again
    this.showCheck(ed, issue);
  };

  Controller.prototype.showCheck = function (ed, issue) {
    this.ensureHost();
    this.ed = ed;
    this.chkIssue = issue;
    var level = E.LEVELS[issue.level] || E.LEVELS.error;
    var scope = E.describeTop(this.caretLine(ed)); // only when it parses: says what the formula says at the top
    this.chkEl.className = 'chk ' + (issue.level || 'error');
    this.chkEl.innerHTML = '<b>' + esc(issue.message) + '</b> <span>· ' + esc(level.tail) + ' · Esc</span>' +
      (scope ? '<span class="scope">' + esc(scope) + '</span>' : '');
    this.chkEl.style.display = 'block';
    this.positionCheck();
  };

  Controller.prototype.positionCheck = function () {
    if (!this.chkEl || this.chkEl.style.display === 'none' || !this.ed) return;
    if (!this.ed.el.isConnected) return this.hideCheck(); // editor removed by the page
    var r = this.caretRect(this.ed), t = this.chkEl;
    var top = r.top - t.offsetHeight - 8;
    if (top < 8) top = r.bottom + 8;
    t.style.top = top + 'px';
    t.style.left = Math.min(Math.max(8, r.left - 16), window.innerWidth - t.offsetWidth - 8) + 'px';
  };

  Controller.prototype.hideCheck = function () {
    this.chkIssue = null;
    if (this.chkEl) this.chkEl.style.display = 'none';
  };

  // ------------------------------------------------------------------ UI
  Controller.prototype.ensureHost = function () {
    if (this.stopped) return;
    if (this.host && this.host.isConnected) return;
    this.host = document.createElement('mathlogic-ui');
    this.host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    var st = document.createElement('style');
    st.textContent = CSS;
    this.shadow.appendChild(st);
    this.box = document.createElement('div');
    this.box.className = 'box';
    this.box.style.display = 'none';
    this.shadow.appendChild(this.box);
    this.chkEl = document.createElement('div');
    this.chkEl.className = 'chk';
    this.chkEl.style.display = 'none';
    this.shadow.appendChild(this.chkEl);
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.style.display = 'none';
    this.shadow.appendChild(this.toastEl);
    (document.body || document.documentElement).appendChild(this.host);
    var self = this;
    this.box.addEventListener('mousedown', function (e) {
      e.preventDefault(); // keep focus in the editor
      var it = e.target.closest('.it');
      if (!it) return;
      var ed = self.ed;
      self.sel = +it.dataset.i;
      if (ed) self.accept(ed, self.items[self.sel]);
    });
  };

  Controller.prototype.caretRect = function (ed) {
    if (ed.type === 'text') return textareaCaretRect(ed.el);
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return ed.el.getBoundingClientRect();
    var r = sel.getRangeAt(0).cloneRange();
    r.collapse(false);
    var rects = r.getClientRects();
    var rect = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height && !rect.top)) {
      var n = sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement);
      rect = (n || ed.el).getBoundingClientRect();
    }
    return rect;
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  Controller.prototype.render = function () {
    this.ensureHost();
    var st = this.settings();
    var mode = st.mode, target = st.target;
    var tag = mode + (mode === 'ASCII' && target !== 'generic' && E.TARGETS[target] ? ' · ' + E.TARGETS[target].label : '');
    var html = '<div class="hd"><span>Math Logic</span><span class="mode">' + esc(tag) + '</span></div>';
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      var glyph = E.glyphFor(it);
      var ins = E.renderEntry(it, mode, target);
      html += '<div class="it' + (i === this.sel ? ' on' : '') + '" data-i="' + i + '">' +
        '<div class="g' + (glyph.word ? ' sm' : '') + '">' + esc(glyph.text) + '</div>' +
        '<div class="tx"><div class="t">\\' + esc(it.trigger) + '</div>' +
        '<div class="n">' + esc(it.name) + (!it.multiline && (it.kind === 'template' || (mode !== 'UNICODE' && mode !== 'AUTO')) ? ' · ' + esc(ins) : '') + '</div></div></div>';
    }
    var cur = this.items[this.sel];
    if (cur) {
      var full = E.renderEntry(cur, mode, target);
      var lines = full.split('\n');
      var shown = lines.length > 1 ? lines.slice(0, 2).join('  ⏎  ') + '  …' : full;
      var hint = E.hintFor(cur);
      html += '<div class="pv"><div class="ins">' + esc(shown) + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
    }
    html += '<div class="ft"><kbd>Tab</kbd>/<kbd>Enter</kbd> insert · <kbd>Space</kbd> exact · <kbd>↑↓</kbd> · <kbd>Esc</kbd></div>';
    this.box.innerHTML = html;
    this.box.style.display = 'block';
    this.position(this.box);
  };

  Controller.prototype.position = function (el) {
    if (!this.ed) return;
    var r = this.caretRect(this.ed);
    var h = el.offsetHeight || 260, w = el.offsetWidth || 300;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6); // chat boxes sit at the bottom
    var left = Math.min(Math.max(8, r.left - 12), window.innerWidth - w - 8);
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  };

  Controller.prototype.close = function () {
    this.open = false;
    if (this.box) this.box.style.display = 'none';
  };

  Controller.prototype.toast = function (msg, isErr) {
    this.ensureHost();
    var t = this.toastEl;
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.style.display = 'block';
    var ed = this.ed || this.edFromEvent({ target: document.activeElement });
    if (ed) {
      this.ed = ed;
      var r = this.caretRect(ed);
      var top = r.top - t.offsetHeight - 10;
      if (top < 8) top = r.bottom + 10;
      t.style.top = top + 'px';
      t.style.left = Math.min(Math.max(8, r.left - 20), window.innerWidth - t.offsetWidth - 8) + 'px';
    } else {
      t.style.top = '16px'; t.style.left = '16px';
    }
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { t.style.display = 'none'; }, isErr ? T.toastError : T.toast);
  };

  // Mirror-div technique for caret coordinates inside a textarea/input.
  var MIRROR_PROPS = ['direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize'];
  function textareaCaretRect(el) {
    var rect = el.getBoundingClientRect();
    var div = document.createElement('div');
    var cs = getComputedStyle(el);
    var isInput = el.tagName === 'INPUT';
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.top = '0';
    div.style.left = '-9999px';
    div.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
    div.style.wordWrap = 'break-word';
    MIRROR_PROPS.forEach(function (p) { div.style[p] = cs[p]; });
    div.style.overflow = 'hidden';
    div.textContent = el.value.slice(0, el.selectionEnd);
    var span = document.createElement('span');
    span.textContent = el.value.slice(el.selectionEnd) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    var top = rect.top + span.offsetTop - el.scrollTop;
    var left = rect.left + span.offsetLeft - el.scrollLeft;
    var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 18;
    div.remove();
    return { top: top, bottom: top + lh, left: left, right: left, width: 0, height: lh };
  }

  root.MathLogicController = Controller;

  // ---------------------------------------------------------------------------
  // Extension bootstrap (only when running as a content script)
  // ---------------------------------------------------------------------------
  var isExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage &&
    location.protocol !== 'chrome-extension:';
  if (!isExt || root.__mathlogicBooted) return;
  root.__mathlogicBooted = true;

  // Where each setting lives is settings.js's business, not a rule repeated here.
  var settings = Object.assign(JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS)), { enabled: false }); // until storage answers
  function load() {
    root.MathLogicSettings.load().then(function (next) { settings = next; });
  }
  load();
  chrome.storage.onChanged.addListener(load);
  document.documentElement.setAttribute('data-mathlogic-ext', '1');

  new Controller({
    getSettings: function () { return settings; },
    ai: function (phrase, mode) {
      return new Promise(function (resolve, reject) {
        try {
          chrome.runtime.sendMessage({ type: 'mathlogic-ai', phrase: phrase, mode: mode }, function (resp) {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (resp && resp.ok) resolve(resp.text); else reject(new Error((resp && resp.error) || 'unknown error'));
          });
        } catch (err) { reject(err); }
      });
    }
  }).start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
