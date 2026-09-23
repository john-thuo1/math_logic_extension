// Guards for "one concept, one place": each test fails if a second copy of some
// piece of knowledge appears and drifts from the one the engine owns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

const all = () => E.SYMBOLS.concat(E.TEMPLATES);

test('LaTeX rendering reads the symbol table, so ASCII spellings cannot fork', () => {
  for (const e of E.SYMBOLS) {
    const m = /^\\([A-Za-z]+)$/.exec(e.latex);
    if (!m || m[1] !== e.trigger) continue; // aliases are allowed to differ
    assert.equal(E.renderLatex(e.latex, 'UNICODE').text.trim(), e.unicode, '\\' + m[1] + ' unicode');
    assert.equal(E.renderLatex(e.latex, 'ASCII').text.trim(), e.ascii, '\\' + m[1] + ' ascii');
  }
});

test('every machine is defined once: the heading, the definition and the label agree', () => {
  const machines = E.SYMBOLS.filter((e) => e.category === 'Automata');
  assert.equal(machines.length, 12);
  for (const m of machines) {
    const def = E.findExact(m.trigger + 'def');
    assert.ok(def, m.trigger + ' has a full-definition template');
    assert.equal(def.glyph, m.glyph, 'one label per machine');
    for (const [i, mode] of ['UNICODE', 'LATEX', 'ASCII'].entries()) {
      const head = E.renderEntry(m, mode).split(i === 1 ? ',\\ ' : ', ')[0];
      assert.ok(E.renderEntry(def, mode).startsWith(head), m.trigger + ' ' + mode + ' tuple matches its definition');
    }
    assert.ok(E.hintFor(m).includes('\\' + m.trigger + 'def'), 'the heading hint points at the definition');
    assert.ok(E.hintFor(def).length > 20, m.trigger + 'def has a hint');
  }
});

test('the bracketed temporal variants spell their operator the way the operator does', () => {
  for (const t of E.TEMPLATES.filter((x) => /of$/.test(x.trigger) && x.category === 'Temporal')) {
    const op = E.findExact(t.trigger.slice(0, -2));
    assert.ok(op, t.trigger + ' has an operator');
    for (const [mode, spelling] of [['UNICODE', op.unicode], ['LATEX', op.latex], ['ASCII', op.ascii]]) {
      assert.ok(E.renderEntry(t, mode).includes(spelling), t.trigger + ' ' + mode + ' uses ' + spelling);
    }
  }
});

test('the output modes are one table, used by the pages and by the AI prompt', () => {
  assert.deepEqual(E.MODE_INFO.map((m) => m.id).sort(), Object.keys(E.MODES).sort());
  for (const m of E.MODE_INFO) {
    for (const k of ['label', 'sample', 'short', 'desc', 'hint', 'ai']) assert.ok(m[k], m.id + '.' + k);
  }
  const body = JSON.parse(E.buildAIRequest('x squared', 'ASCII', { provider: 'groq', apiKey: 'k' }).init.body);
  assert.ok(JSON.stringify(body).includes(E.modeInfo('ASCII').ai), 'the prompt quotes the table, not its own copy');
});

test('each target explains itself from its own token table', () => {
  for (const [id, t] of Object.entries(E.TARGETS)) {
    assert.ok(t.label && t.help, id + ' has a label and help text');
    if (!t.tokens) continue;
    assert.ok(t.help.includes(t.tokens.Xs) && t.help.includes(t.tokens.Xw), id + ' help states its own next spellings');
    for (const op of Object.keys(t.missing || {})) {
      const issue = E.checkFormula('G(a -> F b) & (c ' + op + ' d)', { target: id }) || E.checkFormula('G(a -> F b) & ' + op + '(c)', { target: id });
      assert.match(issue.message, new RegExp(t.label.replace(/[()]/g, '\\$&')), id + ' names itself when it lacks ' + op);
    }
  }
});

test('severity is ranked in one place, and the worst issue always wins', () => {
  for (const [name, l] of Object.entries(E.LEVELS)) {
    assert.equal(typeof l.rank, 'number', name + ' has a rank');
    assert.ok(l.tail, name + ' has wording for the warning');
  }
  // a line with a structural error and a style slip reports the structural one
  const both = E.checkFormula('G(a ⇒ F(b) ∧ (c → d) ∧ e U');
  assert.equal(both.level, 'error');
  assert.equal(E.checkFormula('G(a ⇒ F b) ∧ (c → d)').level, 'style');
});

test('one glyph rule for the popup, the settings sheet and the website', () => {
  for (const e of all()) {
    const g = E.glyphFor(e);
    assert.ok(g.text.length > 0 && g.text.length <= 6, '\\' + e.trigger + ' → ' + g.text);
    assert.equal(g.word, e.category === 'Automata');
    if (e.glyph) assert.equal(g.text, e.glyph);
  }
});

test('recipe keys and cheat-sheet search come from the engine', () => {
  assert.deepEqual(E.recipeKey('{Tab}'), { press: 'Tab' });
  assert.deepEqual(E.recipeKey('\\dfadef'), { type: '\\dfadef' });
  for (const r of E.RECIPES) for (const k of r.keys) {
    const parsed = E.recipeKey(k);
    assert.ok(parsed.press || parsed.type, r.id + ' key ' + k);
  }
  const forall = E.findExact('forall');
  assert.ok(E.searchText(forall).includes('for all') && E.searchText(forall).includes('∀'));
  assert.equal(E.searchText(forall), E.searchText(forall).toLowerCase(), 'search text is normalised once');
});

test('defaults live in DEFAULT_SETTINGS only', () => {
  const d = E.DEFAULT_SETTINGS;
  for (const k of ['enabled', 'mode', 'smartOps', 'bracketCheck', 'wrapLatex', 'latexDelims', 'target', 'disabledSites', 'customSnippets', 'ai']) {
    assert.ok(k in d, k + ' has a default');
  }
  assert.ok(E.MODE_INFO.some((m) => m.id === d.mode), 'the default mode is one of the modes');
  assert.ok(E.TARGETS[d.target], 'the default target is one of the targets');
});
