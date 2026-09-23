import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

const u = (p) => E.convertOffline(p, 'UNICODE').text;
const l = (p) => E.convertOffline(p, 'LATEX', { wrapLatex: false }).text;

// [phrase, expected Unicode]
const GOLDEN = [
  // quantifiers & logic
  ['for all x in R, x squared is at least 0', '∀x ∈ ℝ, x² ≥ 0'],
  ['for every epsilon greater than 0 there exists delta greater than 0', '∀ε > 0 ∃δ > 0'],
  ['there exists x in the naturals such that x is greater than 5', '∃x ∈ ℕ : x > 5'],
  ['there exists a unique x such that f(x) = 0', '∃!x : f(x) = 0'],
  ['not (p and q) is equivalent to not p or not q', '¬(p ∧ q) ⇔ ¬p ∨ ¬q'],
  ['p implies q and q implies r', '(p ⇒ q) ∧ (q ⇒ r)'],
  ['p and q implies r', 'p ∧ q ⇒ r'],
  ['if p implies q and q implies r then p implies r', '((p ⇒ q) ∧ (q ⇒ r)) ⇒ (p ⇒ r)'],
  ['if x is positive then x squared is positive', 'x > 0 ⇒ x² > 0'],
  ['p if and only if q', 'p ⇔ q'],
  ['p xor q', 'p ⊕ q'],
  ['Gamma proves phi', 'Γ ⊢ φ'],
  ['capital sigma', 'Σ'],
  // sets
  ['A union B is a subset of C', 'A ∪ B ⊆ C'],
  ['A intersect B equals the empty set', 'A ∩ B = ∅'],
  ['x is not in A', 'x ∉ A'],
  ['x is an element of A set minus B', 'x ∈ A ∖ B'],
  ['A is a proper subset of B', 'A ⊂ B'],
  ['the power set of A', '𝒫(A)'],
  ['the complement of A', 'Aᶜ'],
  ['set of all x in R such that x squared is less than 2', '{ x ∈ ℝ | x² < 2 }'],
  ['the set of all n such that n divides 12', '{ n | n | 12 }'], // \\mid is both "such that" and "divides"
  ['for all x, x in A implies x in B or x in C', '∀x, x ∈ A ⇒ x ∈ B ∨ x ∈ C'],
  ['v in R^n', 'v ∈ ℝⁿ'],
  ['x is a real number', 'x ∈ ℝ'],
  ['square root of 2 is not rational', '√2 ∉ ℚ'],
  ['square root of 2 is irrational', '√2 ∉ ℚ'],
  // relations & arithmetic
  ['x is approximately 3.14', 'x ≈ 3.14'],
  ['a is congruent to b mod n', 'a ≡ b mod n'],
  ['x is not equal to y', 'x ≠ y'],
  ['x is less than or equal to y', 'x ≤ y'],
  ['x is much greater than 1', 'x ≫ 1'],
  ['y is proportional to x', 'y ∝ x'],
  ['a plus or minus b', 'a ± b'],
  ['a times b', 'a · b'],
  ['a divided by b', 'a/b'],
  ['1 over n', '1/n'],
  ['n choose k', 'C(n, k)'],
  ['n factorial', 'n!'],
  ['absolute value of x', '|x|'],
  ['the norm of v', '‖v‖'],
  ['floor of x', '⌊x⌋'],
  ['x cubed minus 2x', 'x³ - 2x'],
  ['x to the power of n', 'xⁿ'],
  ['2 to the 10th power', '2¹⁰'],
  ['e to the power of i pi plus 1 equals 0', 'e^(i π) + 1 = 0'],
  ['cube root of 8 equals 2', '∛8 = 2'],
  ['log base 2 of n', 'log₂ n'],
  ['natural log of x', 'ln x'],
  ['sin of x squared', 'sin(x²)'],
  ['f of x equals x cubed minus 2x', 'f(x) = x³ - 2x'],
  ['function f from R to R', 'f: ℝ → ℝ'],
  ['a_n tends to 0 as n goes to infinity', 'aₙ → 0 as n → ∞'],
  ['x approaches infinity', 'x → ∞'],
  // calculus
  ['sum of 1/n^2 from n=1 to infinity', '∑_(n=1)^∞ 1/n²'],
  ['sum of 1/n^2 from n=1 to inf', '∑_(n=1)^∞ 1/n²'],
  ['sum from i=1 to n of i equals n(n+1)/2', '∑_(i=1)^n i = n(n+1)/2'],
  ['the sum of a_i for i from 1 to n', '∑_(i=1)^n aᵢ'],
  ['sum over k from 0 to n of n choose k', '∑_(k=0)^n C(n, k)'],
  ['product of i from i=1 to n', '∏_(i=1)^n i'],
  ['union of A_i from i=1 to infinity', '⋃_(i=1)^∞ Aᵢ'],
  ['integral from 0 to 1 of x^2 dx', '∫_0^1 x² dx'],
  ['integral of sin of x from 0 to pi', '∫_0^π sin(x) dx'],
  ['integral of e^(-t) from 0 to infinity dt', '∫_0^∞ e⁻ᵗ dt'],
  ['integral of f of x dx', '∫ f(x) dx'],
  ['integral from negative infinity to infinity of e^(-x^2) dx', '∫_(-∞)^∞ e^(-x²) dx'],
  ['limit of sin(x)/x as x approaches 0', 'lim_(x→0) sin(x)/x'],
  ['limit as x goes to infinity of 1 over x', 'lim_(x→∞) 1/x'],
  ['limit of 1/x as x approaches 0 from the right', 'lim_(x→0⁺) 1/x'],
  ['limit as h goes to 0 of (f(x+h) - f(x))/h', 'lim_(h→0) (f(x+h) - f(x))/h'],
  ['derivative of f(x) with respect to x', 'd/dx f(x)'],
  ['derivative of x^2 with respect to x', 'd/dx (x²)'],
  ['partial derivative of f with respect to y', '∂f/∂y'],
  ['the second derivative of y with respect to t', 'd²y/dt²'],
  ['gradient of f', '∇f'],
  // probability
  ['probability of A given B', 'P(A | B)'],
  ['P(A given B) equals P(A and B) over P(B)', 'P(A | B) = P(A ∧ B)/P(B)'],
  ['the expected value of X', '𝔼[X]'],
  ['variance of X', 'Var(X)'],
  ['X is distributed as N(0, 1)', 'X ∼ N(0, 1)'],
  // typed operators inside /math
  ['x <= y and y != z', 'x ≤ y ∧ y ≠ z'],
  ['p => q', 'p ⇒ q'],
];
for (const [phrase, want] of GOLDEN) test(`nl: ${phrase}`, () => assert.equal(u(phrase), want));

const LATEX = [
  ['for all x in R, x squared is at least 0', '\\forall x \\in \\mathbb{R}, x^{2} \\geq 0'],
  ['sum of 1/n^2 from n=1 to infinity', '\\sum_{n=1}^{\\infty} 1/n^2'],
  ['integral from 0 to 1 of x^2 dx', '\\int_{0}^{1} x^2 \\, dx'],
  ['limit as x goes to infinity of 1 over x', '\\lim_{x \\to \\infty} \\frac{1}{x}'],
  ['partial derivative of f with respect to y', '\\frac{\\partial f}{\\partial y}'],
  ['set of all x in R such that x squared is less than 2', '\\{ x \\in \\mathbb{R} \\mid x^{2} < 2 \\}'],
  ['n choose k', '\\binom{n}{k}'],
];
for (const [phrase, want] of LATEX) test(`nl latex: ${phrase}`, () => assert.equal(l(phrase), want));

test('LaTeX mode wraps in $…$ when asked', () => {
  assert.equal(E.convertOffline('x squared', 'LATEX', { wrapLatex: true }).text, '$x^{2}$');
});

test('confidence: understood phrases are confident', () => {
  for (const [p] of GOLDEN) assert.equal(E.convertOffline(p, 'UNICODE').confident, true, p);
});

test('confidence: phrases with unknown words are flagged (so AI can take over)', () => {
  for (const p of ['2 by 2 matrix a b c d', 'the eigenvalues of A', 'Fourier transform of f', 'x is prime']) {
    const r = E.convertOffline(p, 'UNICODE');
    assert.equal(r.confident, false, p);
    assert.ok(r.leftover.length > 0);
  }
});

test('words inside other words are never replaced', () => {
  // "in" inside "sin"/"integral"/"infinity"; "or" inside "for"; "to" inside "total"
  assert.equal(u('sin of x'), 'sin(x)');
  assert.equal(u('for all x'), '∀x');
  assert.doesNotMatch(u('the total is 5'), /→/);
  assert.doesNotMatch(u('Fourier'), /∨/);
});

test('ℝ/ℕ/ℤ/ℚ/ℂ letters are not blackboard-ified when the phrase names its own sets', () => {
  assert.equal(u('x in A implies x in C'), 'x ∈ A ⇒ x ∈ C');
  assert.equal(u('x in C'), 'x ∈ ℂ');
});

test('"inf" alone is an infimum, not infinity', () => {
  assert.doesNotMatch(u('inf of S'), /∞/);
});

test('never throws and always returns a string', () => {
  for (const p of ['', '   ', '???', 'of of of', 'sum', 'integral', 'limit', 'from to', '\\\\', '((((', 'the the']) {
    assert.doesNotThrow(() => E.convertOffline(p, 'UNICODE'), p);
    assert.equal(typeof E.convertOffline(p, 'ASCII').text, 'string');
  }
});
