import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

// Applies the engine's rule the way the controller does: before + next key → new text.
function typeNext(before, next) {
  const r = E.smartOperator(before, next);
  return r ? before.slice(0, before.length - r.remove) + r.insert : before;
}

const CONVERTS = [
  ['a->', ' ', 'a→'], ['a=>', 'b', 'a⇒'], ['p<=>', ' ', 'p⇔'], ['x<=', '3', 'x≤'], ['x>=', ' ', 'x≥'],
  ['a!=', 'b', 'a≠'], ['x~=', ' ', 'x≈'], ['x+-', '1', 'x±'], ['x-+', '1', 'x∓'],
  ['p<->', ' ', 'p↔'], ['A==>', ' ', 'A⟹'], ['x|->', ' ', 'x↦'], ['A-->', ' ', 'A⟶'], ['P<==>', ' ', 'P⟺'],
  ['x<=-', '1', 'x≤-'], // operator followed by a sign
  ['x^2', ' ', 'x²'], ['x^2', '+', 'x²'], ['x^2', ')', 'x²'], ['x^10', ',', 'x¹⁰'], ['x^-1', ' ', 'x⁻¹'],
  ['e^x', ' ', 'eˣ'], ['A^T', ' ', 'Aᵀ'], ['2^n', '-', '2ⁿ'], ['e^-x', ' ', 'e⁻ˣ'], [')^2', ' ', ')²'],
  ['x_1', ' ', 'x₁'], ['a_n', ',', 'aₙ'], ['x_12', ')', 'x₁₂'], ['(a_i', ')', '(aᵢ'],
];
for (const [before, next, want] of CONVERTS) {
  test(`converts ${JSON.stringify(before)} + ${JSON.stringify(next)}`, () => assert.equal(typeNext(before, next), want));
}

const UNCHANGED = [
  ['a-', '>', 'still typing the operator'], ['a<', '=', 'still typing'], ['x^', '2', 'exponent not typed yet'],
  ['x^1', '0', 'exponent continues'], ['x_1', '2', 'subscript continues'], ['x^2', '.', 'x^2.5 is ambiguous'],
  ['x^2', '^', 'tower'], ['a---', ' ', 'markdown rule'], ['a==', ' ', 'plain =='], ['a===', ' ', 'JS strict equality'],
  ['a!==', ' ', 'JS strict inequality'], ['x++', ' ', 'increment'], ['a||', ' ', 'logical or in code'],
  ['<!--', ' ', 'html comment'], ['x<', '-', 'x < -1 must not become ←'], ['x<-', '1', 'x<-1 means x < -1'],
  ['my_var', ' ', 'snake_case'], ['file_name', ' ', 'snake_case'], ['a_bc', ' ', 'multi-letter subscript'],
  ['\\alpha^2', ' ', 'after a backslash command: leave for LaTeX users'], ['a^^2', ' ', 'double caret'],
  ['x^q', ' ', 'no superscript q exists'], ['x_y', ' ', 'no subscript y exists'], ['-', '>', 'single char'],
  ['', ' ', 'empty'], ['a->', '>', '->> is still being typed'],
];
for (const [before, next, why] of UNCHANGED) {
  test(`leaves ${JSON.stringify(before)} + ${JSON.stringify(next)} alone (${why})`, () => assert.equal(typeNext(before, next), before));
}

test('undefined next char (Enter / end of message) finishes pending conversions', () => {
  assert.equal(typeNext('x^2', undefined), 'x²');
  assert.equal(typeNext('a->', undefined), 'a→');
  assert.equal(typeNext('a->b', undefined), 'a->b');
});

test('toSup / toSub return null when any char is unmappable', () => {
  assert.equal(E.toSup('2n+1'), '²ⁿ⁺¹');
  assert.equal(E.toSub('i+1'), 'ᵢ₊₁');
  assert.equal(E.toSup('q'), null);
  assert.equal(E.toSub('y'), null);
});
