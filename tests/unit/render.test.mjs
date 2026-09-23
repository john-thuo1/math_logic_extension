import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

const U = (l) => E.renderLatex(l, 'UNICODE').text;
const A = (l) => E.renderLatex(l, 'ASCII').text;

const UNICODE = [
  ['\\forall x \\in \\mathbb{R}, x^2 \\geq 0', '∀x ∈ ℝ, x² ≥ 0'],
  ['\\exists! n \\in \\mathbb{N}', '∃!n ∈ ℕ'],
  ['\\neg (p \\land q) \\iff \\neg p \\lor \\neg q', '¬(p ∧ q) ⇔ ¬p ∨ ¬q'],
  ['\\frac{1}{2}', '1/2'],
  ['\\frac{a+b}{c}', '(a+b)/c'],
  ['\\frac{1}{n^2}', '1/n²'],
  ['\\frac{f(x)}{g(x)}', 'f(x)/g(x)'],
  ['\\frac{(a)+(b)}{c}', '((a)+(b))/c'],
  ['\\frac{\\mathbb{E}[X]}{n}', '𝔼[X]/n'],
  ['\\frac{1}{-x}', '1/-x'],
  ['\\frac{\\partial f}{\\partial x}', '∂f/∂x'],
  ['\\sqrt{2}', '√2'],
  ['\\sqrt{x+1}', '√(x+1)'],
  ['\\sqrt[3]{x}', '∛x'],
  ['\\sqrt[4]{x}', '∜x'],
  ['\\sqrt[n]{x}', 'ⁿ√x'],
  ['\\sum_{n=1}^{\\infty} \\frac{1}{n^2}', '∑_(n=1)^∞ 1/n²'],
  ['\\prod_{i=1}^{n} a_i', '∏_(i=1)^n aᵢ'],
  ['\\int_{0}^{1} x^2 \\, dx', '∫_0^1 x² dx'],
  ['\\int_{-\\infty}^{\\infty} e^{-x^2} dx', '∫_(-∞)^∞ e^(-x²) dx'],
  ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 'lim_(x→0) (sin x)/x'], // numerator grouped: no ambiguity
  ['\\binom{n}{k}', 'C(n, k)'],
  ['\\mathbb{Z}_n', 'ℤₙ'],
  ['\\mathcal{O}(n \\log n)', '𝒪(n log n)'],
  ['\\{ x \\in A \\mid x > 0 \\}', '{ x ∈ A | x > 0 }'],
  ['\\left( a \\right)', '(a)'],
  ['\\left\\| v \\right\\|', '‖v‖'],
  ['x \\not\\in A', 'x ∉ A'],
  ['a \\not= b', 'a ≠ b'],
  ['a \\equiv b \\pmod{n}', 'a ≡ b (mod n)'],
  ['90^\\circ', '90°'],
  ['f\\colon A \\to B', 'f: A → B'],
  ['\\text{if } x > 0', 'if x > 0'],
  ['\\operatorname{Var}(X)', 'Var(X)'],
  ['A^{-1}', 'A⁻¹'],
  ['x^{n+1}', 'xⁿ⁺¹'],
  ['x_{i+1}', 'xᵢ₊₁'],
  ['\\alpha + \\beta = \\gamma', 'α + β = γ'],
  ['\\Gamma \\vdash \\varphi', 'Γ ⊢ φ'],
  ['$x^2$', 'x²'],
  ['\\(x^2\\)', 'x²'],
  ['$$\\pi$$', 'π'],
];
for (const [latex, want] of UNICODE) test(`unicode: ${latex}`, () => assert.equal(U(latex), want));

test('non-representable super/subscripts fall back to ^( ) and are flagged lossy', () => {
  const r = E.renderLatex('x^{q+1}', 'UNICODE');
  assert.equal(r.text, 'x^(q+1)');
  assert.equal(r.lossy, true);
});

test('matrices and cases are lossy in Unicode → AUTO switches to $LaTeX$', () => {
  const m = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}';
  assert.equal(U(m), '[[a, b], [c, d]]');
  assert.equal(E.renderLatex(m, 'AUTO').text, '$' + m + '$');
  assert.equal(E.renderLatex(m, 'AUTO', { wrapLatex: false }).text, m);
  const c = 'f(x) = \\begin{cases} 1 & \\text{if } x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}';
  assert.equal(U(c), 'f(x) = { 1 if x > 0; 0 otherwise }');
});

test('AUTO keeps Unicode when nothing is lost', () => {
  const r = E.renderLatex('\\forall x \\in \\mathbb{R}, x^2 \\geq 0', 'AUTO');
  assert.equal(r.text, '∀x ∈ ℝ, x² ≥ 0');
  assert.equal(r.lossy, false);
});

test('unknown commands are kept verbatim and flagged', () => {
  const r = E.renderLatex('\\foo x', 'UNICODE');
  assert.match(r.text, /\\foo/);
  assert.equal(r.lossy, true);
});

test('LATEX mode passes through, optionally wrapped once', () => {
  assert.equal(E.renderLatex('x^2', 'LATEX').text, 'x^2');
  assert.equal(E.renderLatex('x^2', 'LATEX', { wrapLatex: true }).text, '$x^2$');
  assert.equal(E.renderLatex('$x^2$', 'LATEX', { wrapLatex: true }).text, '$x^2$', 'no double $$');
});

const ASCII = [
  ['\\forall x \\in \\mathbb{R}, x^2 \\geq 0', 'forall x in R, x^2 >= 0'],
  ['\\exists x : P(x)', 'exists x : P(x)'],
  ['p \\implies q', 'p => q'],
  ['\\frac{a+b}{c}', '(a+b)/c'],
  ['\\sqrt{x+1}', 'sqrt(x+1)'],
  ['\\sum_{i=1}^{n} i', 'sum_(i=1)^n i'],
  ['\\int_{0}^{1} f(x) \\, dx', 'int_0^1 f(x) dx'],
  ['x \\neq y', 'x != y'],
  ['A \\cup B', 'A union B'],
  ['\\alpha', 'alpha'],
];
for (const [latex, want] of ASCII) test(`ascii: ${latex}`, () => assert.equal(A(latex), want));

test('renderer never throws on malformed input', () => {
  for (const bad of ['\\frac{', '\\frac{1}', '^', '_', '{{{', '}}}', '\\', '\\begin{pmatrix} a', '\\sqrt[', 'x^{', '']) {
    assert.doesNotThrow(() => U(bad), bad);
    assert.doesNotThrow(() => A(bad), bad);
    assert.equal(typeof U(bad), 'string');
  }
});
