import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, PH } from './_engine.mjs';

const slots = (s) => s.split(PH).length - 1;

test('automata tuples: the standard definitions, with the transition function type', () => {
  const want = {
    dfa: 'M = (Q, Σ, δ, q₀, F), δ: Q × Σ → Q',
    nfa: 'M = (Q, Σ, δ, q₀, F), δ: Q × Σ → 𝒫(Q)',
    enfa: 'M = (Q, Σ, δ, q₀, F), δ: Q × (Σ ∪ {ε}) → 𝒫(Q)',
    pda: 'M = (Q, Σ, Γ, δ, q₀, Z₀, F), δ: Q × (Σ ∪ {ε}) × Γ → 𝒫(Q × Γ*)',
    tm: 'M = (Q, Σ, Γ, δ, q₀, q_accept, q_reject), δ: Q × Γ → Q × Γ × {L, R}',
    cfg: 'G = (V, Σ, R, S), R ⊆ V × (V ∪ Σ)*',
    kripke: 'K = (S, S₀, R, L), R ⊆ S × S, L: S → 2ᴬᴾ',
    mdp: 'M = (S, A, P, R), P: S × A × S → [0, 1], R: S × A → ℝ',
  };
  for (const [t, u] of Object.entries(want)) {
    const e = E.findExact(t);
    assert.equal(e.category, 'Automata', t);
    assert.equal(e.unicode, u, t);
  }
  for (const t of ['mealy', 'moore', 'buchi', 'dtmc']) assert.ok(E.findExact(t), t);
});

test('automata tuples: LaTeX versions render back to the same Unicode', () => {
  for (const t of ['dfa', 'nfa', 'enfa', 'pda', 'cfg', 'mealy', 'moore', 'buchi', 'kripke', 'dtmc', 'mdp']) {
    const e = E.findExact(t);
    assert.equal(E.renderLatex(e.latex, 'UNICODE').text, e.unicode, t);
  }
});

test('transition tables: \\ttableSxA has a header row plus one row per state', () => {
  for (const [t, st, sy] of [['ttable', 3, 2], ['ttable2x2', 2, 2], ['ttable4x3', 4, 3], ['ttable10x10', 10, 10]]) {
    const e = E.findExact(t);
    const n = sy + st * (1 + sy);
    for (const m of ['UNICODE', 'LATEX', 'ASCII']) assert.equal(slots(E.renderEntry(e, m)), n, `${t} ${m}`);
    assert.equal(e.unicode.split('\n').length, st + 2, `${t} lines`);
  }
  assert.equal(E.findExact('ttable11x2'), null);
  assert.match(E.renderEntry(E.findExact('ttable'), 'LATEX'), /^\\begin\{array\}\{c\|cc\} \\delta & /);
});

test('diagram blocks: fenced Mermaid / DOT code, same in every mode', () => {
  const g = E.findExact('graph');
  assert.equal(g.multiline, true);
  assert.match(g.unicode, /^```mermaid\nstateDiagram-v2\n/);
  assert.match(g.unicode, /\n```$/);
  assert.equal(slots(g.unicode), 8);
  assert.equal(E.renderEntry(g, 'LATEX'), g.unicode);
  const d = E.findExact('graphviz');
  assert.match(d.unicode, /^```dot\ndigraph M \{/);
  assert.ok(slots(d.unicode) >= 5);
});

test('delimiters: best flavour per chat site, or the user’s explicit choice', () => {
  assert.equal(E.delimsFor('chatgpt.com', 'auto'), 'paren');
  assert.equal(E.delimsFor('chat.openai.com', 'auto'), 'paren');
  assert.equal(E.delimsFor('claude.ai', 'auto'), 'double');
  assert.equal(E.delimsFor('gemini.google.com', 'auto'), 'dollar');
  assert.equal(E.delimsFor('example.com', 'auto'), 'dollar');
  assert.equal(E.delimsFor('notclaude.ai', 'auto'), 'dollar', 'no suffix tricks');
  assert.equal(E.delimsFor('claude.ai', 'dollar'), 'dollar', 'explicit choice wins');
  assert.equal(E.delimsFor('chatgpt.com', undefined), 'paren');
});

test('delimiters: wrapping never doubles up', () => {
  assert.equal(E.wrapMath('x^2', 'paren'), '\\(x^2\\)');
  assert.equal(E.wrapMath('$x^2$', 'paren'), '\\(x^2\\)');
  assert.equal(E.wrapMath('\\(x^2\\)', 'double'), '$$x^2$$');
  assert.equal(E.renderLatex('x^2', 'LATEX', { wrapLatex: true, delims: 'paren' }).text, '\\(x^2\\)');
  const m = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}';
  assert.equal(E.renderLatex(m, 'AUTO', { delims: 'double' }).text, '$$' + m + '$$');
  assert.equal(E.convertOffline('x squared', 'LATEX', { wrapLatex: true, delims: 'paren' }).text, '\\(x^{2}\\)');
});

const MACHINES = { dfa: 4, nfa: 4, enfa: 4, pda: 6, tm: 6, cfg: 4, mealy: 4, moore: 4, buchi: 4, kripke: 4, dtmc: 3, mdp: 2 };

test('full definitions: every machine has a \\…def template with one box per component to supply', () => {
  for (const [m, boxes] of Object.entries(MACHINES)) {
    const e = E.findExact(m + 'def');
    assert.ok(e, `\\${m}def exists`);
    assert.equal(e.kind, 'template');
    assert.equal(e.category, 'Automata');
    for (const mode of ['UNICODE', 'LATEX', 'ASCII']) assert.equal(slots(E.renderEntry(e, mode)), boxes, `\\${m}def ${mode}`);
    // it starts with exactly the same tuple as the heading shortcut
    const head = E.findExact(m).unicode.split(',')[0];
    assert.ok(e.unicode.startsWith(head), `\\${m}def starts with ${head}`);
  }
});

test('full definitions: the DFA reads correctly in every format', () => {
  const e = E.findExact('dfadef');
  assert.equal(e.unicode, `M = (Q, Σ, δ, q₀, F) where Q = {${PH}}, Σ = {${PH}}, δ: Q × Σ → Q, q₀ = ${PH}, F = {${PH}}`);
  assert.equal(e.latex, `M = (Q, \\Sigma, \\delta, q_0, F) \\text{ where } Q = \\{${PH}\\},\\ \\Sigma = \\{${PH}\\},\\ \\delta\\colon Q \\times \\Sigma \\to Q,\\ q_0 = ${PH},\\ F = \\{${PH}\\}`);
  assert.equal(e.ascii, `M = (Q, Sigma, delta, q0, F) where Q = {${PH}}, Sigma = {${PH}}, delta: Q x Sigma -> Q, q0 = ${PH}, F = {${PH}}`);
});

test('full definitions: filled-in LaTeX renders to the same Unicode', () => {
  for (const m of Object.keys(MACHINES)) {
    if (m === 'tm') continue; // q_accept renders as q_(accept); Unicode keeps the readable q_accept
    const e = E.findExact(m + 'def');
    const fill = (s) => s.replace(/⬚/g, 'x');
    assert.equal(E.renderLatex(fill(e.latex), 'UNICODE').text, fill(e.unicode), m);
  }
});

test('hints: every temporal, automata, diagram and sized entry explains how to use it', () => {
  const all = [...E.SYMBOLS, ...E.TEMPLATES];
  for (const e of all.filter((x) => ['Temporal', 'Automata', 'Diagrams'].includes(x.category))) {
    assert.ok(E.hintFor(e).length > 10, `\\${e.trigger} has a hint`);
  }
  for (const t of ['mat2x3', 'vec5', 'cases3', 'ttable4x3', 'sumover', 'frac', 'intab']) assert.ok(E.hintFor(E.findExact(t)), t);
  assert.match(E.hintFor(E.findExact('dfa')), /\\dfadef/);
  assert.equal(E.hintFor(E.findExact('alpha')), '', 'plain symbols need no hint');
});

test('docs never point to a shortcut that does not exist', () => {
  const texts = [];
  for (const e of [...E.SYMBOLS, ...E.TEMPLATES]) texts.push(E.hintFor(e));
  for (const r of E.RECIPES) texts.push(r.tip, ...r.keys);
  const missing = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/(?<![\\\w])\\([A-Za-z][A-Za-z0-9]*)/g)) if (!E.findExact(m[1])) missing.add(m[1]);
  }
  assert.deepEqual([...missing], []);
});

test('recipes are well-formed', () => {
  const ids = new Set();
  for (const r of E.RECIPES) {
    assert.ok(r.id && r.title && r.tip && r.result, r.id);
    assert.ok(!ids.has(r.id), 'unique id');
    ids.add(r.id);
    for (const k of r.keys) assert.ok(typeof k === 'string' && k.length > 0);
    for (const k of r.keys) if (/^\{/.test(k)) assert.match(k, /^\{(Tab|Enter|Space)\}$/);
  }
  assert.ok(E.RECIPES.length >= 5);
});

test('automata labels are short, readable and unique per machine', () => {
  const base = E.SYMBOLS.filter((e) => e.category === 'Automata');
  const labels = base.map((e) => e.glyph);
  assert.equal(new Set(labels).size, labels.length, 'labels must differ: ' + labels);
  for (const e of base.concat(E.TEMPLATES.filter((t) => t.category === 'Automata'))) {
    assert.ok(e.glyph && e.glyph.length <= 5, e.trigger + ' → ' + e.glyph);
    assert.ok(!/[…(]/.test(e.glyph), 'no truncated tuple for ' + e.trigger);
  }
  assert.equal(E.findExact('dfa').glyph, 'DFA');
  assert.equal(E.findExact('buchidef').glyph, 'NBA');
});

// --------------------------------------------------------------- bracket check
test('the bracket check flags brackets that were opened and never closed', () => {
  const bad = 'G((request ∧ ¬error) ⇒ F(grant ∧ X((¬cancel U complete) ∧ G(complete ⇒ F(ack)))) ∧ F(checkpoint)';
  const issue = E.checkFormula(bad);
  assert.equal(issue.type, 'unclosed');
  assert.equal(issue.count, 1);
  assert.match(issue.message, /unclosed/);
  assert.equal(E.checkFormula(bad + ')'), null, 'balanced formula is accepted');
});

test('the bracket check reports extra and mismatched closers', () => {
  assert.equal(E.checkFormula('a ∧ b) ⇒ c').type, 'extra');
  assert.equal(E.checkFormula('(a ∧ b] ⇒ c').type, 'mismatch');
  assert.equal(E.checkFormula('G(a ⇒ F b) ∧ F(c)'), null);
});

test('the bracket check stays out of ordinary prose and plain arithmetic', () => {
  for (const t of ['I met her (on Tuesday, I think', 'the result (see section 2 was wrong', 'x = (1 + 2) * (3', 'call foo(bar, baz', '']) {
    assert.equal(E.checkFormula(t), null, t);
  }
  assert.equal(E.looksLikeFormula('G(a -> F(b) & X(c)'), true, 'ASCII logic counts as a formula');
  assert.equal(E.checkFormula('G(a -> F(b) & X(c)').count, 1);
});

test('temporal operators stay standalone, with optional bracketed variants', () => {
  assert.equal(E.findExact('G').kind, 'symbol');
  assert.equal(E.findExact('G').unicode, 'G', 'plain G inserts just G, so "G p" and "G F p" stay possible');
  assert.equal(E.findExact('Gof').unicode, 'G(' + PH + ')');
  assert.equal(E.findExact('Uof').unicode, '(' + PH + ' U ' + PH + ')');
  assert.equal(E.findExact('Xwof').latex, '\\tilde{\\mathbf{X}}(' + PH + ')');
  for (const t of ['Gof', 'Fof', 'Xof', 'Xwof', 'Yof', 'Oof', 'Hof', 'Uof', 'Rof', 'Wof', 'Mof', 'Sof']) {
    const e = E.findExact(t);
    assert.ok(e && e.category === 'Temporal', t);
    assert.equal(E.checkFormula(e.unicode.replace(/⬚/g, 'p') + ' ∧ q'), null, t + ' inserts balanced brackets');
    assert.match(E.hintFor(e), /optional/);
  }
  assert.ok(E.getSuggestions('G', { limit: 8 }).some((e) => e.trigger === 'Gof'), '\\G offers the bracketed form too');
  assert.match(E.hintFor(E.findExact('X')), /LTLf|weak/);
});

// ------------------------------------------------- target syntax (LTL / LTLf)
test('target presets decide how strong and weak next are written in ASCII', () => {
  const X = E.findExact('Xs'), Xw = E.findExact('Xw');
  const table = {
    generic: ['X', 'WX'],      // plain LTL letters
    ltlf2dfa: ['X', 'WX'],     // whitemech.github.io/LTLf2DFA/grammars
    spot: ['X[!]', 'X'],       // spot.lre.epita.fr/tut12.html
    pylogics: ['X[!]', 'X'],   // whitemech.github.io/pylogics/grammars
  };
  for (const [target, [strong, weak]] of Object.entries(table)) {
    assert.equal(E.renderEntry(X, 'ASCII', target), strong, target + ' strong next');
    assert.equal(E.renderEntry(Xw, 'ASCII', target), weak, target + ' weak next');
    assert.equal(E.renderEntry(X, 'UNICODE', target), 'X', 'display never changes with the target');
    assert.equal(E.renderEntry(E.findExact('X'), 'ASCII', target), 'X', 'plain \\X stays the bare letter; the checker warns instead');
  }
  assert.equal(E.renderEntry(E.findExact('Xsof'), 'ASCII', 'spot'), 'X[!](' + PH + ')');
  assert.equal(E.renderEntry(E.findExact('Xwof'), 'ASCII', 'generic'), 'WX(' + PH + ')', 'no target: the LTL letters');
  assert.equal(E.renderEntry(E.findExact('and'), 'ASCII', 'spot'), '&');
  assert.equal(E.renderEntry(E.findExact('implies'), 'ASCII', 'pylogics'), '->');
  assert.equal(E.renderEntry(E.findExact('and'), 'ASCII', 'generic'), '/\\', 'generic ASCII is unchanged');
  assert.equal(E.DEFAULT_SETTINGS.target, 'generic');
});

test('the checker reports dangling operators and empty groups', () => {
  assert.match(E.checkFormula('G(a ⇒ F(b)) ∧ c U').message, /until \(U\) has nothing after it/);
  assert.match(E.checkFormula('U b ∧ c').message, /nothing before it/);
  assert.match(E.checkFormula('G(a -> F()) & b').message, /empty/);
  assert.equal(E.checkFormula('G(a ⇒ F b) ∧ F(c)'), null);
});

test('the checker warns when one formula mixes two implication symbols', () => {
  assert.match(E.checkFormula('a ∧ b ⇒ c → d').message, /two implication symbols/);
  assert.equal(E.checkFormula('a ∧ b ⇒ c ⇒ d'), null, 'one symbol used consistently is fine');
  assert.equal(E.checkFormula('a & b -> c -> d'), null);
});

test('target warnings name the tool and stay silent for generic', () => {
  const t = (text, target) => (E.checkFormula(text, { target }) || {}).message || null;
  assert.match(t('G(a ⇒ F b) ∧ F(c)', 'ltlf2dfa'), /ASCII/);
  assert.equal(t('G(a ⇒ F b) ∧ F(c)', 'generic'), null, 'no target chosen, no complaint');
  assert.match(t('G(a -> F b) & (c W d)', 'ltlf2dfa'), /no “W”/);
  assert.equal(t('G(a -> F b) & (c W d)', 'pylogics'), null, 'PyLogics has W');
  assert.match(t('G(a -> F b) & WX(c)', 'spot'), /weak next as X/);
  assert.match(t('G(a -> X\\[!\\] b)'.replace(/\\/g, ''), 'ltlf2dfa'), /strong next as X/);
  assert.match(t('G(a -> F b) & Y(c)', 'spot'), /no “Y”/);
  assert.equal(t('G(a -> F b) & Y(c)', 'ltlf2dfa'), null, 'LTLf2DFA has a past-operator grammar');
});

test('operator names follow the standard vocabulary', () => {
  const name = (t) => E.findExact(t).name;
  assert.match(name('X'), /^next/, 'plain X is just Next; strong/weak only matters on finite traces');
  assert.match(name('Xs'), /strong next/);
  assert.match(name('Xw'), /weak next/);
  assert.match(name('U'), /until/);
  assert.match(name('R'), /release/);
  assert.match(name('W'), /weak until/);
  assert.match(name('M'), /strong release/);
  assert.match(name('Y'), /previous/);
  assert.equal(E.findExact('start').category, 'Finite traces', 'helpers are not temporal operators');
  assert.equal(E.findExact('last').category, 'Finite traces');
  assert.match(E.hintFor(E.findExact('X')), /\\Xs/, 'plain X points at the explicit pair');
  assert.match(E.hintFor(E.findExact('Xs')), /X\[!\]/);
  assert.match(E.hintFor(E.findExact('W')), /LTLf2DFA has no W/);
});

test('bare X is flagged as target-dependent, and the explicit forms are not', () => {
  const t = (text, target) => { const i = E.checkFormula(text, { target }); return i && i.level + ': ' + i.message; };
  assert.match(t('G(request -> X grant)', 'spot'), /^semantic: X is weak next in Spot/);
  assert.match(t('G(request -> X grant)', 'pylogics'), /^semantic: X is weak next in PyLogics/);
  assert.match(t('G(request -> X grant)', 'ltlf2dfa'), /^semantic: X is strong next in LTLf2DFA/);
  assert.equal(t('G(request -> X grant)', 'generic'), null, 'no target, no opinion');
  assert.equal(t('G(request -> X[!] grant)', 'spot'), null, 'explicit strong next needs no warning');
  assert.equal(t('G(request -> WX grant)', 'ltlf2dfa'), null, 'explicit weak next needs no warning');
});

test('issues carry a severity, worst first', () => {
  const lvl = (text, target) => (E.checkFormula(text, { target }) || {}).level;
  assert.equal(lvl('G(a -> X b'), 'error', 'brackets beat everything');            // unbalanced
  assert.equal(lvl('G(a ⇒ F b) ∧ c U'), 'error');                                  // dangling operator
  assert.equal(lvl('G(a ⇒ F b) ∧ c', 'ltlf2dfa'), 'target');                       // tool cannot read it
  assert.equal(lvl('G(a -> X b) & c', 'spot'), 'semantic');                        // parses, may mislead
  assert.equal(lvl('G(a ⇒ F b) ∧ (c → d)'), 'style');                              // mixed arrows
  assert.equal(E.checkFormula('G(a ⇒ F b) ∧ F(c)'), null);
  assert.equal(lvl('a U b U c'), 'info', 'ambiguous grouping is the mildest note');
  assert.deepEqual(Object.keys(E.LEVELS).sort(), ['error', 'info', 'semantic', 'style', 'target']);
});

// -------------------------------------------------- regressions found in review
test('a set called S or R at the end of a line is not a dangling operator', () => {
  for (const t of ['∀x ∈ S', 'K = (S, S₀, R, L), R ⊆ S × S', 'x ∈ ℝ, y ∈ R', 'the relation R ⊆ S × S']) {
    assert.equal(E.checkFormula(t), null, t);
  }
  assert.match(E.checkFormula('G(a => F(b)) & c U').message, /nothing after it/, 'still caught in temporal text');
});

test('every template fills its boxes in the same order in all three modes', () => {
  const r = E.findExact('nroot');
  assert.equal(r.unicode, '(' + PH + ')^(1/' + PH + ')');
  assert.equal(r.latex, '{' + PH + '}^{1/' + PH + '}', 'LaTeX used to be \\sqrt[index]{value}: the opposite order');
  assert.equal(r.ascii, 'root(' + PH + ', ' + PH + ')');
});

test('renderLatex leaves text with several math spans alone', () => {
  assert.equal(E.renderLatex('$a$ + $b$', 'UNICODE').text, '$a$ + $b$');
  assert.equal(E.renderLatex('$x^2$', 'UNICODE').text, 'x²', 'a single wrapping pair is still stripped');
});

test('a LaTeX command renders as the entry named after it', () => {
  assert.equal(E.renderLatex('\\triangle ABC', 'ASCII').text, 'triangle ABC', 'not symdiff');
  assert.equal(E.renderLatex('\\triangle ABC', 'UNICODE').text, '△ ABC');
});

test('negated set relations beat the generic “is not”', () => {
  assert.equal(E.convertOffline('A is not a subset of B', 'UNICODE').text, 'A ⊈ B');
  assert.equal(E.convertOffline('x is not equal to y', 'UNICODE').text, 'x ≠ y');
});

test('a leftover “of” means the phrase was not understood', () => {
  const u = E.convertOffline('the union of A and B', 'UNICODE');
  assert.equal(u.confident, false, 'so /math can hand it to the AI: ' + u.text);
  assert.equal(E.convertOffline('the derivative of f of x with respect to x', 'UNICODE').text, 'd/dx f(x)');
});

// ------------------------------------------------------------------- the parser
test('the parser maps every alias of an operator to one semantic node', () => {
  const shape = (t) => JSON.stringify(E.parseFormula(t).ast);
  assert.equal(shape('!a & b -> c'), shape('¬a ∧ b ⇒ c'));
  assert.equal(shape('~a && b => c'), shape('¬a ∧ b → c'));
  assert.equal(shape('G(a) | F(b)'), shape('□a ∨ ◇b'));
  assert.equal(shape('a R b'), shape('a V b'), 'V is the same operator as R');
  assert.deepEqual(E.parseFormula('a U b').ast, { op: 'U', args: [{ atom: 'a' }, { atom: 'b' }] });
});

test('precedence follows the usual LTL conventions', () => {
  const top = (t) => E.parseFormula(t).ast.op;
  assert.equal(top('a & b -> c'), 'implies', 'implication is looser than conjunction');
  assert.equal(top('a | b & c'), 'or', 'conjunction binds tighter than disjunction');
  assert.equal(top('G a & b'), 'and', 'a unary operator takes only what follows it');
  assert.equal(top('a U b & c'), 'and', 'until binds tighter than conjunction');
  assert.equal(top('!a U b'), 'U');
  assert.deepEqual(E.parseFormula('G a & b').ast,
    { op: 'and', args: [{ op: 'G', args: [{ atom: 'a' }] }, { atom: 'b' }] });
  assert.equal(JSON.stringify(E.parseFormula('a -> b -> c').ast), JSON.stringify(E.parseFormula('a -> (b -> c)').ast), 'implication is right-associative');
});

test('the tree shows which operator each part sits inside', () => {
  const inside = 'G(start -> (X(processing) & F(done) & F(checkpoint)))';
  const beside = 'G(start -> (X(processing) & F(done))) & F(checkpoint)';
  assert.equal(E.formulaTree(inside), [
    'G',
    '└─ IMPLIES',
    '   ├─ start',
    '   └─ AND',
    '      ├─ X',
    '      │  └─ processing',
    '      ├─ F',
    '      │  └─ done',
    '      └─ F',
    '         └─ checkpoint',
  ].join('\n'));
  assert.match(E.formulaTree(beside), /^AND\n├─ G\n/, 'the sibling version is an AND at the top');
  assert.equal(E.describeTop(inside), 'top level: G');
  assert.equal(E.describeTop(beside), 'top level: AND of 2');
  assert.equal(E.formulaTree('G(a -> b'), null, 'no tree for a formula that does not parse');
  assert.equal(E.formulaTree('∀x ∈ S'), null, 'no tree for text that is not a formula');
});

test('the parser, not a pattern, decides what is a dangling operator', () => {
  const m = (t) => (E.checkFormula(t) || {}).message || null;
  assert.match(m('G(a => F(b)) & c U'), /until \(U\) has nothing after it/);
  assert.match(m('G(a => F(b)) & !'), /negation has nothing after it/);
  assert.equal(m('∀x ∈ S'), null, 'set theory is not a temporal formula');
  assert.equal(m('let me check the R build and the G suite'), null, 'prose is not a formula');
  assert.equal(m('we need G and F to hold'), null);
});

test('chained temporal operators without brackets are pointed out', () => {
  assert.match(E.checkFormula('a U b U c').message, /add brackets/);
  assert.match(E.checkFormula('G(x -> a W b R c)').message, /add brackets/);
  assert.equal(E.checkFormula('(a U b) U c'), null, 'bracketed: nothing to say');
  assert.equal(E.checkFormula('a U (b U c)'), null);
  assert.equal(E.checkFormula('G(a U b) & F(c U d)'), null, 'one per group is fine');
});
