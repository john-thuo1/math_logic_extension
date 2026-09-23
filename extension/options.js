(function () {
  var E = MathLogicEngine, S = MathLogicSettings;
  var s;
  function $(id) { return document.getElementById(id); }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  Object.keys(E.PROVIDERS).forEach(function (k) {
    var o = document.createElement('option');
    o.value = k; o.textContent = E.PROVIDERS[k].label;
    $('provider').appendChild(o);
  });

  // Mode buttons, provider and target lists are all rendered from the engine's tables.
  $('modes').innerHTML = E.MODE_INFO.map(function (m) {
    return '<button data-m="' + esc(m.id) + '"><b>' + esc(m.label) + '</b><span>' + esc(m.sample) + '</span></button>';
  }).join('');

  Object.keys(E.TARGETS).forEach(function (k) {
    var o = document.createElement('option');
    o.value = k; o.textContent = E.TARGETS[k].label;
    $('target').appendChild(o);
  });

  var PROV_HELP = {
    groq: 'Free: about 1,000 requests a day on gpt-oss-20b. No credit card needed, and it responds very fast.',
    gemini: 'Free tier on Flash-Lite. On the free tier, Google may use your prompts to improve its products.',
    openrouter: '“openrouter/free” sends each request to whichever free model is available. About 50 requests a day without credits.',
    custom: 'Any OpenAI-compatible server, e.g. Ollama (http://localhost:11434/v1), LM Studio, or api.openai.com/v1.'
  };

  function paint() {
    Array.prototype.forEach.call(document.querySelectorAll('#modes button'), function (b) { b.classList.toggle('on', b.dataset.m === s.mode); });
    $('wrapLatex').checked = s.wrapLatex !== false;
    $('latexDelims').value = s.latexDelims || 'auto';
    $('latexDelims').disabled = s.wrapLatex === false;
    $('smartOps').checked = s.smartOps !== false;
    $('bracketCheck').checked = s.bracketCheck !== false;
    $('target').value = s.target || 'generic';
    $('targetHelp').textContent = (E.TARGETS[s.target] || E.TARGETS.generic).help;
    $('custom').value = s.customSnippets || '';
    $('sites').value = (s.disabledSites || []).join('\n');
    paintAI();
  }
  function paintAI() {
    var p = E.PROVIDERS[s.ai.provider] || E.PROVIDERS.groq;
    $('provider').value = s.ai.provider;
    $('apiKey').value = s.ai.apiKey || '';
    $('model').value = s.ai.model || '';
    $('model').placeholder = p.model;
    $('baseUrl').value = s.ai.baseUrl || '';
    $('baseUrl').placeholder = p.baseUrl;
    $('baseWrap').style.display = s.ai.provider === 'custom' ? '' : 'none';
    $('keyLink').style.display = p.keyUrl ? '' : 'none';
    $('keyLink').href = p.keyUrl || '#';
    $('provHelp').textContent = PROV_HELP[s.ai.provider] || '';
    $('preferAI').checked = !!s.ai.preferAI;
    $('consent').checked = s.ai.consent === true;
    var on = E.aiReady(s.ai);
    $('aiPill').textContent = on ? 'offline + AI' : 'offline only';
    $('aiPill').className = 'pill ' + (on ? 'ok' : 'warn');
  }
  function save() { return S.save(s); }
  // Typing in a textarea must not hit chrome.storage.sync on every keystroke:
  // it has a write quota, and each write wakes every open tab.
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, E.TIMING.save);
  }

  S.load().then(function (loaded) {
    s = loaded;
    paint();
    // Playground uses the very same controller as the content script.
    new MathLogicController({
      getSettings: function () { return s; },
      scope: $('play'),
      ai: function (phrase, mode) { return E.callAI(phrase, mode, s.ai); }
    }).start();
    renderSheet();
  });

  Array.prototype.forEach.call(document.querySelectorAll('#modes button'), function (b) {
    b.onclick = function () { s.mode = b.dataset.m; save(); paint(); };
  });
  $('wrapLatex').onchange = function () { s.wrapLatex = this.checked; save(); paint(); };
  $('latexDelims').onchange = function () { s.latexDelims = this.value; save(); };
  $('smartOps').onchange = function () { s.smartOps = this.checked; save(); };
  $('bracketCheck').onchange = function () { s.bracketCheck = this.checked; save(); };
  $('target').onchange = function () { s.target = this.value; save(); paint(); renderSheet(); inspect(); };
  $('custom').oninput = function () { s.customSnippets = this.value; saveSoon(); };
  $('sites').oninput = function () { s.disabledSites = this.value.split(/\s+/).filter(Boolean); saveSoon(); };
  $('provider').onchange = function () { s.ai.provider = this.value; s.ai.model = ''; s.ai.baseUrl = ''; paintAI(); save(); };
  // Keep whatever the user has typed into the key/model/URL fields before any repaint.
  function readInputs() {
    s.ai.apiKey = $('apiKey').value.trim();
    s.ai.model = $('model').value.trim();
    s.ai.baseUrl = $('baseUrl').value.trim();
  }
  $('preferAI').onchange = function () { readInputs(); s.ai.preferAI = this.checked; save(); paintAI(); };
  $('consent').onchange = function () {
    readInputs();
    s.ai.consent = this.checked; // unticking turns AI off immediately
    save(); paintAI();
    $('status').textContent = this.checked ? '' : 'AI conversion is off. /math uses the offline converter only.';
  };

  $('saveAI').onclick = function () {
    readInputs();
    var st = $('status');
    var go = function () {
      save().then(function () {
        paintAI();
        if (!s.ai.apiKey && s.ai.provider !== 'custom') { st.textContent = 'Saved. No key, so /math will use the offline converter only.'; return; }
        if (s.ai.consent !== true) { st.textContent = 'Saved. Tick “I understand. Turn on AI conversion.” above to use it.'; return; }
        st.textContent = 'Testing…';
        E.callAI('for all epsilon greater than 0 there exists delta greater than 0', 'UNICODE', s.ai).then(function (t) {
          st.innerHTML = '✅ Works: <span class="math">' + esc(t) + '</span>';
        }, function (err) {
          st.textContent = '❌ ' + (err && err.message || err);
        });
      });
    };
    if (s.ai.provider === 'custom' && s.ai.baseUrl) {
      try {
        var origin = new URL(s.ai.baseUrl).origin + '/*';
        chrome.permissions.request({ origins: [origin] }, function () { go(); });
        return;
      } catch (e) { st.textContent = 'Invalid base URL'; return; }
    }
    go();
  };

  // ---------------------------------------------------------------- inspector
  function inspect() {
    var text = $('finput').value.trim();
    var issue = text ? E.checkFormula(text, { target: s.target }) : null;
    var tree = text ? E.formulaTree(text) : null;
    $('ftop').textContent = text ? (E.describeTop(text) || E.NOT_A_FORMULA) : '';
    $('ftop').className = 'pill ' + (tree ? 'ok' : 'warn');
    $('fissue').textContent = issue ? issue.level.toUpperCase() + ' · ' + issue.message : '';
    $('ftree').textContent = tree || (text ? '' : '');
  }
  $('finput').oninput = inspect;

  // ---------------------------------------------------------------- recipes
  function keyHtml(k) {
    var r = E.recipeKey(k);
    return r.press ? '<kbd>' + esc(r.press) + '</kbd>' : '<code>' + esc(r.type) + '</code>';
  }
  $('recipes').innerHTML = E.RECIPES.map(function (r) {
    return '<div class="recipe" data-id="' + esc(r.id) + '"><h3>' + esc(r.title) + '</h3><div class="keys">' +
      r.keys.map(keyHtml).join('') + '</div><div class="res">' + esc(r.result) + '</div><div class="tip">' + esc(r.tip) + '</div></div>';
  }).join('');

  // ---------------------------------------------------------------- cheat sheet
  var cat = 'All';
  function renderSheet() {
    var custom = E.parseCustomSnippets(s.customSnippets);
    var all = custom.concat(E.SYMBOLS, E.TEMPLATES);
    var cats = ['All'];
    all.forEach(function (e) { if (cats.indexOf(e.category) < 0) cats.push(e.category); });
    $('cats').innerHTML = cats.map(function (c) { return '<button class="' + (c === cat ? 'on' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
    var q = $('q').value.trim().toLowerCase();
    var rows = all.filter(function (e) {
      if (cat !== 'All' && e.category !== cat) return false;
      if (!q) return true;
      return E.searchText(e).indexOf(q) >= 0;
    });
    $('rows').innerHTML = rows.map(function (e) {
      var hint = E.hintFor(e);
      var glyph = E.glyphFor(e);
      return '<tr><td class="g' + (glyph.word ? ' word' : '') + '">' + esc(glyph.text) + '</td><td><code>\\' + esc(e.trigger) + '</code></td><td>' + esc(e.name) +
        (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
        '</td><td><code>' + esc(e.latex) + '</code></td><td><code>' + esc(E.renderEntry(e, 'ASCII', s.target)) + '</code></td></tr>';
    }).join('') || '<tr><td colspan="5" class="muted">No match</td></tr>';
  }
  $('q').oninput = renderSheet;
  $('cats').onclick = function (e) { var b = e.target.closest('button'); if (b) { cat = b.dataset.c; renderSheet(); } };
})();
