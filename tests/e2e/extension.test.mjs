// End-to-end tests of the real extension (content script + background worker)
// in Chromium, against textarea, input, contenteditable, ProseMirror and Quill.
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture, serve, fixtureDir, launchWithExtension, EDITORS, editorApi } from './helpers.mjs';

const PH = '⬚';
let srv, ext, page, ed;

before(async () => {
  await buildFixture();
  srv = await serve(fixtureDir());
  ext = await launchWithExtension();
  page = await ext.ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(srv.url + '/');
  await page.waitForFunction(() => window.fixtureReady && document.documentElement.dataset.mathlogicExt === '1');
  ed = editorApi(page);
});
after(async () => { await ext?.close(); await srv?.close(); });

async function settings(sync = {}, ai = null) {
  await ext.setSettings(sync, ai);
  await page.waitForTimeout(150); // storage.onChanged → content script reload
}

// ---------------------------------------------------------------------------
for (const key of Object.keys(EDITORS)) {
  describe(`editor: ${key}`, () => {
    before(() => settings());
    beforeEach(() => ed.clear(key));

    test('backslash opens ranked suggestions; Tab inserts the top one', async () => {
      await ed.type('\\fora');
      await ed.settle();
      const p = await ed.popup();
      assert.ok(p, 'popup visible');
      assert.equal(p.items[0], 'forall');
      assert.equal(p.selected, 0);
      await ed.press('Tab');
      assert.equal(await ed.text(key), '∀');
      assert.equal(await ed.popup(), null, 'popup closed');
    });

    test('Enter picks the suggestion and does NOT send; the next Enter sends', async () => {
      await ed.type('\\in');
      await ed.press('Enter');
      assert.equal(await ed.text(key), '∈');
      assert.deepEqual(await ed.sent(), []);
      await ed.press('Enter');
      assert.deepEqual(await ed.sent(), ['∈']);
    });

    test('arrow keys choose another suggestion', async () => {
      await ed.type('\\su');
      await ed.settle();
      assert.deepEqual((await ed.popup()).items.slice(0, 2), ['sum', 'sub']);
      await ed.press('ArrowDown');
      assert.equal((await ed.popup()).selected, 1);
      await ed.press('ArrowUp');
      await ed.press('ArrowUp'); // wraps to the last item
      const p = await ed.popup();
      assert.equal(p.selected, p.items.length - 1);
      await ed.press('ArrowDown'); // back to first
      await ed.press('Enter');
      assert.equal(await ed.text(key), '∑');
    });

    test('Escape keeps the literal text and the popup stays closed for that word', async () => {
      await ed.type('\\in');
      await ed.press('Escape');
      await ed.type(' x');
      assert.equal(await ed.text(key), '\\in x');
      assert.deepEqual(await ed.sent(), []);
    });

    test('an Esc-dismissal does not outlive the word (clear + retype shows suggestions again)', async () => {
      await ed.type('\\in');
      await ed.press('Escape');
      await ed.press('ControlOrMeta+A');
      await ed.press('Backspace');
      await ed.type('\\in');
      await ed.settle();
      assert.ok(await ed.popup(), 'popup is back');
    });

    test('Space / punctuation after an exact name converts it', async () => {
      await ed.type('\\alpha and \\RR, \\pi^2 ');
      assert.equal(await ed.text(key), 'α and ℝ, π² ');
    });

    test('quantifiers attach to their variable (∀x, not ∀ x)', async () => {
      await ed.type('\\forall x \\in \\RR \\exists y');
      assert.equal(await ed.text(key), '∀x ∈ ℝ ∃y');
    });

    test('works right after a letter, LaTeX style (x\\in A)', async () => {
      await ed.type('x\\in A');
      assert.equal(await ed.text(key), 'x∈ A');
    });

    test('smart operators, superscripts and subscripts', async () => {
      await ed.type('x^2 + a_1 -> b <= c != d, p <=> q ');
      assert.equal(await ed.text(key), 'x² + a₁ → b ≤ c ≠ d, p ⇔ q ');
    });

    test('code-like text is left alone (===, !==, x<-1, snake_case, `inline code`)', async () => {
      await ed.type('a === b, c !== d, x<-1, my_var `p -> q` r -> s');
      assert.equal(await ed.text(key), 'a === b, c !== d, x<-1, my_var `p -> q` r → s');
    });

    test('Enter converts a pending x^2 before the message is sent', async () => {
      await ed.type('x^2');
      await ed.press('Enter');
      assert.deepEqual(await ed.sent(), ['x²']);
    });

    test('template: slots are selected in order with Tab', async () => {
      await ed.type('\\frac');
      await ed.press('Tab');
      assert.equal(await ed.selectedText(), PH, 'first slot selected');
      await ed.type('1');
      await ed.press('Tab');
      assert.equal(await ed.selectedText(), PH, 'second slot selected');
      await ed.type('n');
      assert.equal(await ed.text(key), '(1)/(n)');
    });

    // Some chat editors collapse our selection on the ⬚ to one side of it. Typing must
    // still replace the box, never leave "1⬚" or "⬚3" behind.
    const collapse = (toStart) => page.evaluate((s) => {
      const a = document.activeElement;
      if (a && 'selectionStart' in a && a.tagName !== 'DIV') {
        const p = s ? a.selectionStart : a.selectionEnd;
        a.setSelectionRange(p, p);
      } else {
        const sel = getSelection();
        if (s) sel.collapseToStart(); else sel.collapseToEnd();
      }
    }, toStart);

    test('matrix: values go INTO the boxes even if the selection was collapsed', async () => {
      await ed.type('\\mat2');
      await ed.press('Tab');
      const vals = ['1', '2', '3', '4'];
      for (let i = 0; i < vals.length; i++) {
        await collapse(i % 2 === 0); // caret before the box, then after it, alternating
        await ed.type(vals[i]);
        if (i < vals.length - 1) await ed.press('Tab');
      }
      assert.equal(await ed.text(key), '[[1, 2], [3, 4]]');
    });

    test('summation: multi-character values fill each box completely', async () => {
      await ed.type('\\sumto');
      await ed.press('Tab');
      const vals = [['k', true], ['0', false], ['n', true], ['a_k', false]];
      for (let i = 0; i < vals.length; i++) {
        await collapse(vals[i][1]);
        await ed.type(vals[i][0]);
        await ed.press(i < vals.length - 1 ? 'Tab' : 'Space');
      }
      assert.equal(await ed.text(key), '∑_(k=0)^(n) aₖ ');
      assert.doesNotMatch(await ed.text(key), /\u2B1A/);
    });

    test('a backslash typed into a box starts a suggestion there', async () => {
      await ed.type('\\frac');
      await ed.press('Tab');
      await collapse(true);
      await ed.type('\\pi');
      await ed.press('Tab'); // pick π
      await ed.press('Tab'); // next box
      await ed.type('2');
      assert.equal(await ed.text(key), '(π)/(2)');
    });

    test('template via Space, four slots, pending x^2 finished on Tab', async () => {
      await ed.type('\\intab ');
      for (const v of ['0', '1', 'x^2']) { await ed.type(v); await ed.press('Tab'); }
      await ed.type('x');
      assert.equal(await ed.text(key), '∫_(0)^(1) x² dx');
      assert.deepEqual(await ed.sent(), []);
    });

    test('/math + Enter converts in place without sending; next Enter sends', async () => {
      await ed.type('Is it true that /math for all x in R, x squared is at least 0');
      await ed.press('Enter');
      await ed.settle();
      assert.equal(await ed.text(key), 'Is it true that ∀x ∈ ℝ, x² ≥ 0');
      assert.deepEqual(await ed.sent(), []);
      await ed.press('Enter');
      assert.deepEqual(await ed.sent(), ['Is it true that ∀x ∈ ℝ, x² ≥ 0']);
    });

    test('/math + Tab converts too', async () => {
      await ed.type('/math sum of 1/n^2 from n=1 to infinity');
      await ed.press('Tab');
      await ed.settle();
      assert.equal(await ed.text(key), '∑_(n=1)^∞ 1/n²');
    });

    test('clicking a suggestion inserts it', async () => {
      await ed.type('\\subs');
      await ed.settle();
      const p = await ed.popup();
      const idx = p.items.indexOf('subset');
      assert.ok(idx >= 0);
      await page.evaluate((i) => {
        const it = document.querySelector('mathlogic-ui').shadowRoot.querySelectorAll('.it')[i];
        it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }, idx);
      await ed.settle();
      assert.equal(await ed.text(key), '⊂');
    });
  });
}

// ---------------------------------------------------------------------------
describe('temporal logic: standalone operators compose into any formula', () => {
  before(() => settings());
  after(() => settings());
  // G(request ⇒ X(((processing ∧ ¬error) U complete) ∧ F(response ∧ X ack)))
  const TYPED = '\\G(request \\implies \\X(((processing \\and \\not error) \\U complete) \\and \\F(response \\and \\X ack)))';

  for (const key of ['ta', 'pm', 'quill']) {
    test(`LTL formula with nested unary and binary operators (${key})`, async () => {
      await ed.clear(key);
      await ed.type(TYPED);
      assert.equal(await ed.text(key), 'G(request ⇒ X(((processing ∧ ¬error) U complete) ∧ F(response ∧ X ack)))');
      assert.deepEqual(await ed.sent(), []);
    });
  }

  test('long conjunctions chain naturally: a ∧ b ∧ c ∧ d', async () => {
    await ed.clear('pm');
    await ed.type('a \\and b \\and c \\and d');
    assert.equal(await ed.text('pm'), 'a ∧ b ∧ c ∧ d');
  });

  test('symbol forms attach to their operand: □◇p, ◯q', async () => {
    await ed.clear('ta');
    await ed.type('\\always \\eventually p, \\next q');
    assert.equal(await ed.text('ta'), '□◇p, ◯q');
  });

  test('CTL and PCTL: A G, E F, bounded until with its one box', async () => {
    await ed.clear('ta');
    await ed.type('\\Apath \\G safe, \\Epath \\F goal, \\Pbound ');
    await ed.type('>=0.9 [ a ');
    await ed.type('\\Uleq ');
    await ed.type('10 b ]');
    assert.equal(await ed.text('ta'), 'A G safe, E F goal, P≥0.9 [ a U≤10 b ]');
  });

  test('LaTeX mode gives the paper convention', async () => {
    await settings({ mode: 'LATEX' });
    await ed.clear('ta');
    await ed.type('\\G(p \\implies \\X q) \\and a \\U b');
    assert.equal(await ed.text('ta'), '\\mathbf{G}(p \\implies \\mathbf{X} q) \\land a \\mathbf{U} b');
    await settings();
  });
});

// ---------------------------------------------------------------------------
describe('sized templates: the size is part of the shortcut', () => {
  before(() => settings());
  const fill = async (vals) => {
    for (let i = 0; i < vals.length; i++) {
      await ed.type(vals[i]);
      if (i < vals.length - 1) await ed.press('Tab');
    }
  };

  for (const key of ['ta', 'pm', 'quill']) {
    test(`\\mat2x3 + Space → a 2×3 matrix filled with Tab (${key})`, async () => {
      await ed.clear(key);
      await ed.type('A = \\mat2x3 ');
      await fill(['1', '2', '3', '4', '5', '6']);
      assert.equal(await ed.text(key), 'A = [[1, 2, 3], [4, 5, 6]]');
    });
  }

  test('\\vec4 picked from the popup with Tab', async () => {
    await ed.clear('pm');
    await ed.type('v = \\vec4');
    await ed.settle();
    assert.equal((await ed.popup()).items[0], 'vec4');
    await ed.press('Tab');
    await fill(['a', 'b', 'c', 'd']);
    assert.equal(await ed.text('pm'), 'v = (a, b, c, d)');
  });

  test('\\cases3: three branches', async () => {
    await ed.clear('ta');
    await ed.type('\\cases3 ');
    await fill(['f(x)', '-1', 'x < 0', '0', 'x = 0', '1']);
    assert.equal(await ed.text('ta'), 'f(x) = { -1 if x < 0; 0 if x = 0; 1 otherwise }');
  });

  test('\\sumover: sum over a set', async () => {
    await ed.clear('ta');
    await ed.type('\\sumover ');
    await ed.type('i \\in S');
    await ed.press('Tab');
    await ed.type('a_i ');
    assert.equal(await ed.text('ta'), '∑_(i ∈ S) aᵢ ');
  });

  test('LaTeX mode: \\mat3x2 gives a pmatrix', async () => {
    await settings({ mode: 'LATEX' });
    await ed.clear('ta');
    await ed.type('\\mat3x2 ');
    await fill(['1', '2', '3', '4', '5', '6']);
    assert.equal(await ed.text('ta'), '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\\\ 5 & 6 \\end{pmatrix}');
    await settings();
  });
});

// ---------------------------------------------------------------------------
describe('automata tuples and diagram blocks', () => {
  before(() => settings());

  for (const key of ['ta', 'pm']) {
    test(`\\dfa + Space expands to the 5-tuple (${key})`, async () => {
      await ed.clear(key);
      await ed.type('Let \\dfa ');
      assert.equal(await ed.text(key), 'Let M = (Q, Σ, δ, q₀, F), δ: Q × Σ → Q ');
    });
  }

  const MERMAID_FILLED = ['```mermaid', 'stateDiagram-v2', '    direction LR', '    [*] --> q0',
    '    q0 --> q1: a', '    q1 --> q0: b', '    q1 --> [*]', '```'].join('\n');

  for (const key of ['ta', 'ce', 'pm', 'quill']) {
    test(`\\graph inserts a Mermaid block; boxes fill with Tab; --> stays code (${key})`, async () => {
      await ed.clear(key);
      await ed.type('\\graph ');
      await ed.settle();
      assert.equal(await ed.selectedText(), PH, 'first box selected');
      const vals = ['q0', 'q0', 'q1', 'a', 'q1', 'q0', 'b', 'q1'];
      for (let i = 0; i < vals.length; i++) {
        await ed.type(vals[i]);
        if (i < vals.length - 1) await ed.press('Tab');
      }
      const got = (await ed.text(key)).replace(/\n+/g, '\n');
      assert.equal(got, MERMAID_FILLED);
      assert.deepEqual(await ed.sent(), [], 'nothing was sent');
    });
  }

  for (const key of ['ta', 'pm']) {
    test(`a diagram typed mid-line starts on its own line, so the fence is valid (${key})`, async () => {
      await ed.clear(key);
      await ed.type('Draw this: \\graph ');
      await ed.settle();
      const lines = (await ed.text(key)).split(/\n+/);
      assert.equal(lines[0].trimEnd(), 'Draw this:');
      assert.equal(lines[1], '```mermaid');
    });
  }

  test('\\ttable2x2 in a textarea: a markdown transition table', async () => {
    await ed.clear('ta');
    await ed.type('\\ttable2x2 ');
    for (const [i, v] of ['a', 'b', 'q0', 'q1', 'q0', 'q1', 'q1', 'q1'].entries()) {
      if (i) await ed.press('Tab');
      await ed.type(v);
    }
    assert.equal(await ed.text('ta'), '| δ | a | b |\n|---|---|---|\n| q0 | q1 | q0 |\n| q1 | q1 | q1 |');
  });

  test('single-line input: a diagram collapses onto one line instead of breaking', async () => {
    await ed.clear('inp');
    await ed.type('\\graph ');
    assert.doesNotMatch(await ed.text('inp'), /\n/);
  });
});

describe('LaTeX delimiters', () => {
  after(() => settings());

  test('default on an unknown site: $…$', async () => {
    await settings({ mode: 'LATEX' });
    await ed.clear('ta');
    await ed.type('/math x squared');
    await ed.press('Enter');
    await ed.settle();
    assert.equal(await ed.text('ta'), '$x^{2}$');
  });

  for (const [pref, want] of [['paren', '\\(x^{2}\\)'], ['double', '$$x^{2}$$']]) {
    test(`explicit choice: ${pref}`, async () => {
      await settings({ mode: 'LATEX', latexDelims: pref });
      await ed.clear('ta');
      await ed.type('/math x squared');
      await ed.press('Enter');
      await ed.settle();
      assert.equal(await ed.text('ta'), want);
    });
  }
});

// ---------------------------------------------------------------------------
describe('documented recipes produce exactly the documented result', () => {
  let RECIPES;
  before(async () => {
    await settings();
    RECIPES = await ext.sw.evaluate(() => self.MathLogicEngine.RECIPES);
  });
  const play = async (keys) => {
    for (const k of keys) {
      const m = /^\{(Tab|Enter|Space)\}$/.exec(k);
      if (m) await ed.press(m[1]); else await ed.type(k);
      await ed.settle(20);
    }
  };
  for (const key of ['ta', 'pm']) {
    test(`every recipe replays correctly (${key})`, async () => {
      assert.ok(RECIPES.length >= 5);
      for (const r of RECIPES) {
        await ed.clear(key);
        await play(r.keys);
        await ed.settle();
        const got = (await ed.text(key)).replace(/\n+/g, '\n');
        assert.equal(got, r.result, `recipe "${r.title}"`);
        assert.deepEqual(await ed.sent(), [], `recipe "${r.title}" sent nothing`);
      }
    });
  }
});

describe('bracket check', () => {
  before(() => settings());

  test('warns about a bracket that was opened and never closed, and clears when it is closed', async () => {
    await ed.clear('ta');
    await ed.type('G((request & !error) => F(grant)');
    assert.match(await ed.check(), /1 unclosed/);
    await ed.type(')');
    assert.equal(await ed.check(), null, 'balanced again');
  });

  test('says nothing about ordinary prose with a stray bracket', async () => {
    await ed.clear('ta');
    await ed.type('I met her (on Tuesday, I think, and we talked');
    assert.equal(await ed.check(), null);
  });

  test('never blocks typing or changes the text', async () => {
    await ed.clear('ta');
    await ed.type('G(a => F(b)');
    assert.match(await ed.check(), /unclosed/);
    await ed.type(' & X(c)');
    assert.equal(await ed.text('ta'), 'G(a ⇒ F(b) & X(c)');
    await ed.press('Enter');
    assert.deepEqual(await ed.sent(), ['G(a ⇒ F(b) & X(c)'], 'Enter still sends');
  });

  test('Esc hides it until the line is balanced again', async () => {
    await ed.clear('ta');
    await ed.type('G(a => F(b)');
    assert.match(await ed.check(), /unclosed/);
    await ed.press('Escape');
    assert.equal(await ed.check(100), null);
    await ed.type(' & c');
    assert.equal(await ed.check(), null, 'stays hidden after Esc');
    await ed.type(')');
    await ed.type(' & X(d');
    assert.match(await ed.check(), /unclosed/, 'comes back once the line was balanced in between');
  });

  test('stays quiet in code blocks and when switched off', async () => {
    await ed.clear('ta');
    await ed.type('```\nG(a => F(b)');
    assert.equal(await ed.check(), null, 'code fence');
    await settings({ bracketCheck: false });
    await ed.clear('ta');
    await ed.type('G(a => F(b)');
    assert.equal(await ed.check(), null, 'switched off');
    await settings();
  });

  test('works in a rich chat editor too', async () => {
    await ed.clear('pm');
    await ed.type('G(a => F(b)');
    assert.match(await ed.check(), /1 unclosed/);
    await ed.type(')');
    assert.equal(await ed.check(), null);
    await ed.clear('ta');
  });

  test('warns when the formula uses syntax the chosen tool does not accept', async () => {
    await settings({ target: 'ltlf2dfa' });
    await ed.clear('ta');
    await ed.type('G(a => F(b)) & (c W d)');
    assert.match(await ed.check(), /no .W./);
    await settings();
    await ed.clear('ta');
    await ed.type('G(a => F(b)) & (c W d)');
    assert.equal(await ed.check(), null, 'no target chosen, no complaint');
  });

  test('a dangling operator is reported', async () => {
    await ed.clear('ta');
    await ed.type('G(a => F(b)) & c U');
    assert.match(await ed.check(), /until \(U\) has nothing after it/);
  });

  test('bare X is flagged as target-dependent, and the explicit forms are not', async () => {
    await settings({ target: 'spot', mode: 'ASCII' });
    await ed.clear('ta');
    await ed.type('G(request -> X grant)');
    assert.match(await ed.check(), /X is weak next in Spot/);
    await ed.clear('ta');
    await settings({ target: 'spot', mode: 'ASCII' });
    await ed.type('G(request -> X[!] grant)');
    assert.equal(await ed.check(), null);
    await settings();
    await ed.clear('ta');
    await ed.type('G(request -> X grant)');
    assert.equal(await ed.check(), null, 'no target chosen, no opinion');
  });

  test('bracketed operator variants insert balanced brackets', async () => {
    await ed.clear('ta');
    await ed.type('\\Gof');
    await ed.settle();
    await ed.press('Tab');
    await ed.type('a');
    assert.equal(await ed.text('ta'), 'G(a)');
    assert.equal(await ed.check(), null);
  });
});

describe('regressions', () => {
  before(() => settings());

  test('Esc then Enter sends the message instead of accepting the rejected suggestion', async () => {
    await ed.clear('ta');
    await ed.type('\\in');
    await ed.press('Escape');
    await ed.press('Enter');
    assert.equal(await ed.text('ta'), '\\in', 'the dismissed suggestion is not applied');
    assert.deepEqual(await ed.sent(), ['\\in'], 'and Enter sends, as typed');
  });

  test('closing the popup with an arrow key keeps it closed', async () => {
    await ed.clear('ta');
    await ed.type('\\alpha');
    await ed.settle();
    await ed.press('ArrowLeft');
    assert.equal(await ed.popup(), null);
    await ed.press('End');
    await ed.press('Enter');
    assert.deepEqual(await ed.sent(), ['\\alpha'], 'Enter sends rather than reviving the popup');
  });

  test('Option+M (µ) with nothing to convert is left to the page', async () => {
    await ed.clear('ta');
    await ed.type('10 ');
    await page.evaluate(() => {
      const t = document.querySelector('#ta');
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', altKey: true, bubbles: true, cancelable: true }));
    });
    await ed.settle();
    assert.equal(await ed.toast(), null, 'no toast: that key press is how a Mac types µ');
  });

  test('the warning disappears when the editor is removed from the page', async () => {
    await ed.clear('ta');
    await ed.type('G(a => F(b)');
    assert.match(await ed.check(), /unclosed/);
    await page.evaluate(() => { const t = document.querySelector('#ta'); t.__parent = t.parentNode; t.remove(); });
    await page.evaluate(() => window.dispatchEvent(new Event('scroll', { bubbles: true })));
    assert.equal(await ed.check(100), null);
    await page.evaluate(() => { const t = window.__removed || document.querySelector('#ta'); });
    await page.reload();
    await page.waitForFunction(() => window.fixtureReady);
  });
});

describe('target syntax presets', () => {
  after(() => settings());

  test('ASCII output follows the selected tool for strong and weak next', async () => {
    for (const [target, strong, weak] of [['ltlf2dfa', 'X', 'WX'], ['spot', 'X[!]', 'X'], ['pylogics', 'X[!]', 'X']]) {
      await settings({ mode: 'ASCII', target });
      await ed.clear('ta');
      await ed.type('\\Xs');
      await ed.settle();
      await ed.press('Tab');
      assert.equal(await ed.text('ta'), strong, target + ' strong next');
      await ed.clear('ta');
      await ed.type('\\Xw');
      await ed.settle();
      await ed.press('Tab');
      assert.equal(await ed.text('ta'), weak, target + ' weak next');
    }
  });

  test('the display modes are untouched by the target', async () => {
    await settings({ mode: 'UNICODE', target: 'spot' });
    await ed.clear('ta');
    await ed.type('\\X');
    await ed.settle();
    await ed.press('Tab');
    assert.equal(await ed.text('ta'), 'X');
  });

  test('the popup header names the target in ASCII mode', async () => {
    await settings({ mode: 'ASCII', target: 'spot' });
    await ed.clear('ta');
    await ed.type('\\X');
    await ed.settle();
    const tag = await page.evaluate(() => document.querySelector('mathlogic-ui').shadowRoot.querySelector('.mode').textContent);
    assert.match(tag, /ASCII · Spot/);
    await ed.press('Escape');
  });
});

describe('the popup explains the highlighted suggestion', () => {
  before(() => settings());
  const preview = () => page.evaluate(() => {
    const pv = document.querySelector('mathlogic-ui').shadowRoot.querySelector('.pv');
    return pv ? { ins: pv.querySelector('.ins').textContent, hint: (pv.querySelector('.hint') || {}).textContent || '' } : null;
  });

  test('heading vs full definition: the hint points to \\dfadef, the preview shows the boxes', async () => {
    await ed.clear('ta');
    await ed.type('\\dfa');
    await ed.settle();
    let pv = await preview();
    assert.equal(pv.ins, 'M = (Q, Σ, δ, q₀, F), δ: Q × Σ → Q');
    assert.match(pv.hint, /\\dfadef/);
    const items = (await ed.popup()).items;
    const idx = items.indexOf('dfadef');
    assert.ok(idx > 0, 'dfadef is offered too');
    for (let i = 0; i < idx; i++) await ed.press('ArrowDown');
    pv = await preview();
    assert.match(pv.ins, /where Q = \{⬚\}/);
    assert.match(pv.hint, /Fill each box with Tab/);
  });

  test('automata labels in the popup are readable and not clipped', async () => {
    await ed.clear('ta');
    await ed.type('\\mea');
    await ed.settle();
    const g = await page.evaluate(() => [...document.querySelector('mathlogic-ui').shadowRoot.querySelectorAll('.g')]
      .map((el) => ({ t: el.textContent, clipped: el.scrollWidth > el.clientWidth + 1 })));
    assert.ok(g.some((x) => x.t === 'Mealy'), JSON.stringify(g));
    for (const x of g) assert.equal(x.clipped, false, 'clipped ' + x.t);
    await ed.press('Escape');
  });

  test('temporal operators say what they mean', async () => {
    await ed.clear('ta');
    await ed.type('\\U');
    await ed.settle();
    assert.match((await preview()).hint, /φ U ψ/);
  });

  test('multi-line blocks preview their first lines', async () => {
    await ed.clear('ta');
    await ed.type('\\graph');
    await ed.settle();
    const pv = await preview();
    assert.match(pv.ins, /^```mermaid  ⏎  stateDiagram-v2/);
  });
});

// ---------------------------------------------------------------------------
describe('selection & feedback', () => {
  before(() => settings());

  for (const key of ['ta', 'ce']) {
    test(`Ctrl/Cmd+Z undoes an auto-conversion (${key})`, async () => {
      await ed.clear(key);
      await ed.type('\\alpha');
      await ed.press('Tab');
      assert.equal(await ed.text(key), 'α');
      await ed.press('ControlOrMeta+z');
      assert.equal(await ed.text(key), '\\alpha');
    });
  }

  test('Alt+M converts the selected phrase in place', async () => {
    await ed.clear('pm');
    await ed.type('Note: square root of 2 is irrational');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 'square root of 2 is irrational'.length; i++) await ed.press('ArrowLeft');
    await page.keyboard.up('Shift');
    await ed.press('Alt+m');
    await ed.settle();
    assert.equal(await ed.text('pm'), 'Note: √2 ∉ ℚ');
  });

  test('Alt+M with nothing to convert shows a hint and changes nothing', async () => {
    await ed.clear('ta');
    await ed.type('hello');
    await ed.press('Alt+m');
    await ed.settle();
    assert.equal(await ed.text('ta'), 'hello');
    assert.match((await ed.toast()).text, /Select some text/);
  });

  test('phrase the offline parser cannot fully read: best effort + visible warning', async () => {
    await ed.clear('ta');
    await ed.type('/math eigenvalues of A');
    await ed.press('Enter');
    await ed.settle();
    const t = await ed.toast();
    assert.ok(t && t.error, 'warning toast');
    assert.match(t.text, /eigenvalues/);
    assert.deepEqual(await ed.sent(), []);
  });
});

// ---------------------------------------------------------------------------
describe('where MathLogic must stay quiet', () => {
  before(() => settings());

  test('password fields', async () => {
    await page.focus('#pwd');
    await page.fill('#pwd', '');
    await ed.type('\\alpha x->y ');
    assert.equal(await page.inputValue('#pwd'), '\\alpha x->y ');
  });

  test('elements marked data-mathlogic-off', async () => {
    await ed.clear('#off');
    await ed.type('\\alpha x->y ');
    assert.equal(await ed.text('#off'), '\\alpha x->y ');
  });

  test('inside <code> in a rich editor', async () => {
    await page.evaluate(() => {
      const ce = document.getElementById('ce');
      ce.innerHTML = 'see <code>x</code>';
      const t = ce.querySelector('code').firstChild;
      ce.focus();
      const r = document.createRange(); r.setStart(t, 1); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await ed.type(' -> \\alpha ');
    assert.equal(await ed.text('ce'), 'see x -> \\alpha ');
  });

  test('inside a ``` fenced block', async () => {
    await ed.clear('ta');
    await ed.type('```');
    await page.keyboard.press('Shift+Enter');
    await ed.type('if (a != b) x -> y');
    assert.equal(await ed.text('ta'), '```\nif (a != b) x -> y');
    await page.keyboard.press('Shift+Enter');
    await ed.type('```');
    await page.keyboard.press('Shift+Enter');
    await ed.type('a != b ');
    assert.equal(await ed.text('ta'), '```\nif (a != b) x -> y\n```\na ≠ b ');
  });
});

// ---------------------------------------------------------------------------
describe('popup placement', () => {
  before(() => settings());

  test('below the caret near the top of the page', async () => {
    await ed.clear('ta');
    await ed.type('\\al');
    await ed.settle();
    const p = await ed.popup();
    const box = await page.locator('#ta').boundingBox();
    assert.ok(p.rect.top > box.y, 'below the first line');
  });

  test('above the caret when the composer is pinned to the bottom (like ChatGPT)', async () => {
    await ed.clear('#low');
    await ed.type('\\al');
    await ed.settle();
    const p = await ed.popup();
    const box = await page.locator('#low').boundingBox();
    assert.ok(p.rect.bottom <= box.y + 30, `popup bottom ${p.rect.bottom} vs composer top ${box.y}`);
    assert.ok(p.rect.top >= 0);
  });

  test('always inside the viewport', async () => {
    const vp = page.viewportSize();
    for (const key of ['ta', 'pm', '#low']) {
      await ed.clear(key);
      await ed.type('\\s');
      await ed.settle();
      const p = await ed.popup();
      assert.ok(p.rect.left >= 0 && p.rect.right <= vp.width && p.rect.top >= 0 && p.rect.bottom <= vp.height, key);
    }
  });

  test('closes when focus leaves the editor', async () => {
    await ed.clear('ta');
    await ed.type('\\al');
    await ed.settle();
    assert.ok(await ed.popup());
    await page.focus('#inp');
    await page.waitForTimeout(200);
    assert.equal(await ed.popup(), null);
  });
});

// ---------------------------------------------------------------------------
describe('settings take effect live', () => {
  after(() => settings());

  test('LaTeX mode: commands inserted with a trailing space; no smart operators', async () => {
    await settings({ mode: 'LATEX' });
    await ed.clear('pm');
    await ed.type('\\fora');
    await ed.press('Tab');
    await ed.type('x \\RR, x^2 -> y');
    assert.equal(await ed.text('pm'), '\\forall x \\mathbb{R}, x^2 -> y');
  });

  test('LaTeX mode: /math result wrapped in $…$ (or not, if turned off)', async () => {
    await settings({ mode: 'LATEX' });
    await ed.clear('ta');
    await ed.type('/math integral from 0 to 1 of x^2 dx');
    await ed.press('Enter');
    await ed.settle();
    assert.equal(await ed.text('ta'), '$\\int_{0}^{1} x^2 \\, dx$');
    await settings({ mode: 'LATEX', wrapLatex: false });
    await ed.clear('ta');
    await ed.type('/math x squared');
    await ed.press('Enter');
    await ed.settle();
    assert.equal(await ed.text('ta'), 'x^{2}');
  });

  test('ASCII mode', async () => {
    await settings({ mode: 'ASCII' });
    await ed.clear('ta');
    await ed.type('\\forall x \\in \\RR ');
    assert.equal(await ed.text('ta'), 'forall x in R ');
  });

  test('smart operators can be turned off', async () => {
    await settings({ smartOps: false });
    await ed.clear('ta');
    await ed.type('x^2 -> y ');
    assert.equal(await ed.text('ta'), 'x^2 -> y ');
  });

  test('custom shortcuts (plain and with [] slots)', async () => {
    await settings({ customSnippets: 'bayes = P(A|B) = P(B|A)P(A)/P(B)\nip = ⟨[], []⟩' });
    await ed.clear('pm');
    await ed.type('\\bayes ');
    assert.equal(await ed.text('pm'), 'P(A|B) = P(B|A)P(A)/P(B) ');
    await ed.clear('pm');
    await ed.type('\\ip ');
    await ed.type('u');
    await ed.press('Tab');
    await ed.type('v');
    assert.equal(await ed.text('pm'), '⟨u, v⟩');
  });

  test('paused on this site / switched off globally', async () => {
    for (const s of [{ disabledSites: ['localhost'] }, { enabled: false }]) {
      await settings(s);
      await ed.clear('ta');
      await ed.type('\\alpha x->y ');
      assert.equal(await ed.text('ta'), '\\alpha x->y ', JSON.stringify(s));
      assert.equal(await ed.popup(), null);
    }
  });
});

// ---------------------------------------------------------------------------
describe('AI fallback (through the background worker, mock server)', () => {
  const aiCfg = () => ({ provider: 'custom', baseUrl: srv.url + '/v1', model: 'mock-model', apiKey: '', preferAI: false, consent: true });
  beforeEach(() => { srv.ai.requests.length = 0; srv.ai.status = 200; srv.ai.delay = 0; });
  after(() => settings());

  test('unknown phrase → AI answer inserted, request is well-formed', async () => {
    await settings({}, aiCfg());
    srv.ai.reply = '```\nλ ∈ σ(A) ⇔ det(A - λI) = 0\n```';
    await ed.clear('pm');
    await ed.type('/math lambda is an eigenvalue of A iff det(A - lambda I) = 0');
    await ed.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(await ed.text('pm'), 'λ ∈ σ(A) ⇔ det(A - λI) = 0');
    assert.equal(srv.ai.requests.length, 1);
    const body = srv.ai.requests[0];
    assert.equal(body.model, 'mock-model');
    assert.equal(body.messages.at(-1).content, 'lambda is an eigenvalue of A iff det(A - lambda I) = 0');
    assert.deepEqual(await ed.sent(), []);
    assert.match((await ed.toast()).text, /AI/);
  });

  test('understood phrase stays offline (no request, no quota used)', async () => {
    await settings({}, aiCfg());
    await ed.clear('ta');
    await ed.type('/math x is at least 3');
    await ed.press('Enter');
    await page.waitForTimeout(300);
    assert.equal(await ed.text('ta'), 'x ≥ 3');
    assert.equal(srv.ai.requests.length, 0);
  });

  test('"always use AI" sends even understood phrases', async () => {
    await settings({}, { ...aiCfg(), preferAI: true });
    srv.ai.reply = 'x ≥ 3';
    await ed.clear('ta');
    await ed.type('/math x is at least 3');
    await ed.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(srv.ai.requests.length, 1);
    assert.equal(await ed.text('ta'), 'x ≥ 3');
  });

  test('AI failure falls back to the offline result and says so', async () => {
    await settings({}, aiCfg());
    srv.ai.status = 500;
    await ed.clear('ta');
    await ed.type('/math eigenvalues of A');
    await ed.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(srv.ai.requests.length, 1);
    assert.equal(await ed.text('ta'), 'eigenvalues of A');
    const t = await ed.toast();
    assert.ok(t.error);
    assert.match(t.text, /mock failure 500/);
  });

  test('AUTO mode: LaTeX answers from the AI are wrapped in $…$', async () => {
    await settings({ mode: 'AUTO' }, aiCfg());
    srv.ai.reply = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}';
    await ed.clear('ta');
    await ed.type('/math 2 by 2 matrix a b c d');
    await ed.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(await ed.text('ta'), '$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$');
  });

  test('user edits the text while AI is thinking → conversion skipped, nothing clobbered', async () => {
    await settings({}, aiCfg());
    srv.ai.reply = 'SHOULD NOT APPEAR';
    srv.ai.delay = 400;
    await ed.clear('ta');
    await ed.type('/math eigenvalues of A');
    await ed.press('Enter');
    await ed.type('!'); // typed while the AI is still answering
    await page.waitForTimeout(900);
    assert.doesNotMatch(await ed.text('ta'), /SHOULD NOT APPEAR/);
  });

  test('key set but AI not switched on (no consent) → nothing is sent', async () => {
    await settings({}, { ...aiCfg(), consent: false, preferAI: true });
    await ed.clear('ta');
    await ed.type('/math eigenvalues of A');
    await ed.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(srv.ai.requests.length, 0);
    assert.equal(await ed.text('ta'), 'eigenvalues of A');
    assert.match((await ed.toast()).text, /turn on AI conversion in Settings/);
  });

  test('background worker itself refuses AI calls without consent', async () => {
    await settings({}, { ...aiCfg(), consent: false });
    const p = await ext.ctx.newPage(); // an extension page can message the worker directly
    await p.goto(`chrome-extension://${ext.extId}/popup.html`);
    const resp = await p.evaluate(() => chrome.runtime.sendMessage({ type: 'mathlogic-ai', phrase: 'eigenvalues of A', mode: 'UNICODE' }));
    await p.close();
    assert.deepEqual(resp, { ok: false, error: 'AI conversion is turned off' });
    assert.equal(srv.ai.requests.length, 0);
  });

  test('no key configured → offline only, never calls out', async () => {
    await settings({}, { provider: 'groq', apiKey: '', model: '', baseUrl: '', preferAI: true, consent: true });
    await ed.clear('ta');
    await ed.type('/math eigenvalues of A');
    await ed.press('Enter');
    await page.waitForTimeout(300);
    assert.equal(srv.ai.requests.length, 0);
    assert.equal(await ed.text('ta'), 'eigenvalues of A');
  });
});
