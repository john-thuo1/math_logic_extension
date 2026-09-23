import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, PH } from './_engine.mjs';

const ALL = [...E.SYMBOLS, ...E.TEMPLATES];
const count = (s, ch) => s.split(ch).length - 1;

test('every entry is complete', () => {
  for (const e of ALL) {
    for (const k of ['trigger', 'name', 'unicode', 'latex', 'ascii', 'category']) {
      assert.equal(typeof e[k], 'string', `${e.trigger}.${k}`);
      assert.ok(e[k].length > 0, `${e.trigger}.${k} empty`);
    }
    assert.match(e.trigger, /^[A-Za-z][A-Za-z0-9*]*$/, `bad trigger ${e.trigger}`);
    assert.ok(Array.isArray(e.aliases));
  }
});

test('triggers are unique across symbols and templates', () => {
  const seen = new Map();
  for (const e of ALL) {
    assert.ok(!seen.has(e.trigger), `duplicate trigger \\${e.trigger} (${seen.get(e.trigger)} and ${e.kind})`);
    seen.set(e.trigger, e.kind);
  }
});

test('templates have the same number of ⬚ slots in every output mode', () => {
  for (const t of E.TEMPLATES) {
    const n = count(t.unicode, PH);
    assert.ok(n >= 1, `${t.trigger} has no slots`);
    assert.equal(count(t.latex, PH), n, `${t.trigger} latex slots`);
    assert.equal(count(t.ascii, PH), n, `${t.trigger} ascii slots`);
  }
});

test('symbols never contain placeholders; LaTeX of templates is brace-balanced', () => {
  for (const s of E.SYMBOLS) assert.ok(!s.unicode.includes(PH) && !s.latex.includes(PH), s.trigger);
  for (const t of E.TEMPLATES) {
    const l = t.latex.replace(/\\[{}]/g, '');
    assert.equal(count(l, '{'), count(l, '}'), `${t.trigger} braces`);
  }
});

test('LaTeX of every single-command symbol renders back to its own Unicode', () => {
  // Guards against the table and the renderer disagreeing (e.g. \perp vs \bot).
  for (const s of E.SYMBOLS) {
    if (!/^\\[A-Za-z]+$/.test(s.latex) && !/^\\mathbb\{.\}$|^\\mathcal\{.\}$/.test(s.latex)) continue;
    const r = E.renderLatex(s.latex, 'UNICODE');
    assert.equal(r.text, s.unicode, `\\${s.trigger}: ${s.latex} → ${r.text}`);
  }
});

test('Greek: lower and upper case are distinct entries', () => {
  const g = E.SYMBOLS.find((s) => s.trigger === 'gamma');
  const G = E.SYMBOLS.find((s) => s.trigger === 'Gamma');
  assert.equal(g.unicode, 'γ');
  assert.equal(G.unicode, 'Γ');
});

test('renderEntry picks the right field per mode (AUTO = Unicode)', () => {
  const f = E.findExact('forall');
  assert.equal(E.renderEntry(f, 'UNICODE'), '∀');
  assert.equal(E.renderEntry(f, 'AUTO'), '∀');
  assert.equal(E.renderEntry(f, 'LATEX'), '\\forall');
  assert.equal(E.renderEntry(f, 'ASCII'), 'forall');
});

test('custom snippets: parsing, [] slots, backslash optional, junk ignored', () => {
  const c = E.parseCustomSnippets('lhs = left-hand side\n\\ip = ⟨[], []⟩\n  bad line\n= nothing\n9x = no\n');
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].trigger, c[0].kind, c[0].unicode], ['lhs', 'symbol', 'left-hand side']);
  assert.deepEqual([c[1].trigger, c[1].kind, c[1].unicode], ['ip', 'template', `⟨${PH}, ${PH}⟩`]);
  assert.equal(E.parseCustomSnippets('').length, 0);
  assert.equal(E.parseCustomSnippets(undefined).length, 0);
});

test('custom snippets take priority over built-ins with the same trigger', () => {
  const custom = E.parseCustomSnippets('alpha = ALPHA!');
  assert.equal(E.findExact('alpha', custom).unicode, 'ALPHA!');
  assert.equal(E.getSuggestions('alpha', { custom })[0].unicode, 'ALPHA!');
});

test('default settings are complete and safe', () => {
  const d = E.DEFAULT_SETTINGS;
  assert.equal(d.enabled, true);
  assert.equal(d.mode, 'UNICODE');
  assert.equal(d.ai.apiKey, '', 'no bundled key');
  assert.ok(E.PROVIDERS[d.ai.provider]);
  assert.deepEqual(Object.keys(E.MODES).sort(), ['ASCII', 'AUTO', 'LATEX', 'UNICODE']);
});

test('temporal logic: every operator is a standalone symbol with a stated arity', () => {
  const unary = ['X', 'F', 'G', 'Xw', 'Y', 'O', 'H', 'next', 'always', 'eventually'];
  const binary = ['U', 'R', 'W', 'M', 'S'];
  for (const t of [...unary, ...binary]) {
    const e = E.findExact(t);
    assert.ok(e, `\\${t} exists`);
    assert.equal(e.kind, 'symbol', `\\${t} is a symbol, not a paired template`);
    assert.equal(e.category, 'Temporal');
    assert.ok(!e.unicode.includes(PH), `\\${t} has no slots`);
    assert.match(e.name, unary.includes(t) ? /unary/ : /binary/, `\\${t} states its arity`);
  }
  for (const old of ['ltlG', 'ltlF', 'ltlX', 'ltlU']) assert.equal(E.findExact(old), null, `${old} removed`);
});

test('temporal logic: LaTeX forms are the paper convention and render back cleanly', () => {
  assert.equal(E.renderEntry(E.findExact('G'), 'LATEX'), '\\mathbf{G}');
  assert.equal(E.renderEntry(E.findExact('U'), 'LATEX'), '\\mathbf{U}');
  assert.equal(E.renderLatex('\\mathbf{G}(p \\implies \\mathbf{X}\\, q) \\land (a \\mathbf{U} b)', 'UNICODE').text, 'G(p ⇒ X q) ∧ (a U b)');
  assert.equal(E.renderLatex('\\tilde{\\mathbf{X}} p', 'UNICODE').text, 'X̃ p');
  assert.equal(E.renderLatex('\\mathbf{P}_{\\geq 0.9} [\\mathbf{F}^{\\leq 10} goal]', 'UNICODE').text, 'P_(≥ 0.9) [F^(≤ 10) goal]');
});

test('temporal logic: bounds are the only boxes (one each)', () => {
  for (const t of ['Pbound', 'Uleq', 'Fleq', 'Gleq']) {
    const e = E.findExact(t);
    assert.equal(e.kind, 'template');
    assert.equal(e.unicode.split(PH).length - 1, 1, t);
  }
});

test('single-letter operators never shadow Greek names', () => {
  assert.equal(E.getSuggestions('Sigma')[0].trigger, 'Sigma');
  assert.equal(E.getSuggestions('Gamma')[0].trigger, 'Gamma');
  assert.equal(E.getSuggestions('G')[0].trigger, 'G');
});

test('sized templates: \\matRxC, \\matN, \\vecN, \\casesN have exactly the right number of boxes', () => {
  const slots = (s) => s.split(PH).length - 1;
  const cases = [['mat2', 4], ['mat3', 9], ['mat2x3', 6], ['mat3x2', 6], ['mat1x5', 5], ['mat10', 100],
    ['vec', 3], ['vec2', 2], ['vec7', 7], ['vec20', 20], ['cases', 4], ['cases2', 4], ['cases3', 6], ['cases10', 20]];
  for (const [t, n] of cases) {
    const e = E.findExact(t);
    assert.ok(e, `\\${t} exists`);
    for (const mode of ['UNICODE', 'LATEX', 'ASCII']) assert.equal(slots(E.renderEntry(e, mode)), n, `\\${t} ${mode}`);
  }
});

test('sized templates: shapes are correct in every format', () => {
  const m = E.findExact('mat2x3');
  assert.equal(E.renderEntry(m, 'UNICODE'), `[[${PH}, ${PH}, ${PH}], [${PH}, ${PH}, ${PH}]]`);
  assert.equal(E.renderEntry(m, 'LATEX'), `\\begin{pmatrix} ${PH} & ${PH} & ${PH} \\\\ ${PH} & ${PH} & ${PH} \\end{pmatrix}`);
  assert.equal(E.renderEntry(E.findExact('vec4'), 'LATEX'), `\\begin{pmatrix} ${PH} \\\\ ${PH} \\\\ ${PH} \\\\ ${PH} \\end{pmatrix}`);
  assert.equal(E.renderEntry(E.findExact('cases3'), 'UNICODE'), `${PH} = { ${PH} if ${PH}; ${PH} if ${PH}; ${PH} otherwise }`);
  // the LaTeX of a filled matrix renders back to the same Unicode layout
  const filled = E.renderEntry(m, 'LATEX').replace(/⬚/g, 'a');
  assert.equal(E.renderLatex(filled, 'UNICODE').text, '[[a, a, a], [a, a, a]]');
});

test('sized templates: out-of-range sizes are rejected, not silently clamped', () => {
  for (const t of ['mat0', 'mat11', 'mat2x11', 'vec1', 'vec21', 'cases1', 'cases11', 'matx3', 'mat2x', 'vec05x']) {
    assert.equal(E.findExact(t), null, t);
  }
});

test('sized templates: typing the size makes it the top suggestion', () => {
  assert.equal(E.getSuggestions('mat2x3')[0].trigger, 'mat2x3');
  assert.equal(E.getSuggestions('vec5')[0].trigger, 'vec5');
  assert.equal(E.getSuggestions('cases4')[0].trigger, 'cases4');
});

test('open-ended big operators: \\sumover takes any subscript; \\sequent is gone (use \\proves)', () => {
  assert.equal(E.renderEntry(E.findExact('sumover'), 'UNICODE'), `∑_(${PH}) ${PH}`);
  assert.equal(E.renderEntry(E.findExact('sumover'), 'LATEX'), `\\sum_{${PH}} ${PH}`);
  for (const t of ['prodover', 'unionover', 'interover']) assert.ok(E.findExact(t), t);
  assert.equal(E.findExact('sequent'), null);
  assert.equal(E.findExact('proves').unicode, '⊢');
});
