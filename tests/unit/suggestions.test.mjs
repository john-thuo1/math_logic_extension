import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

const top = (q, n = 1) => E.getSuggestions(q, { limit: 8 }).slice(0, n).map((e) => e.trigger);

test('empty query gives nothing', () => {
  assert.deepEqual(E.getSuggestions(''), []);
  assert.deepEqual(E.getSuggestions(null), []);
});

test('exact trigger is always first', () => {
  for (const t of ['in', 'int', 'to', 'top', 'sum', 'sub', 'frac', 'forall', 'pi', 'Pi', 'RR', 'leq', 'lim', 'set']) {
    assert.equal(top(t)[0], t, `\\${t}`);
  }
});

test('case-sensitive exact match wins for Greek', () => {
  assert.equal(top('Gamma')[0], 'Gamma');
  assert.equal(top('gamma')[0], 'gamma');
  assert.equal(top('Omega')[0], 'Omega');
});

test('prefix: shorter triggers first, symbols before templates on ties', () => {
  assert.deepEqual(top('su', 2), ['sum', 'sub']);
  assert.equal(top('fora')[0], 'forall');
  assert.equal(top('alp')[0], 'alpha');
  assert.deepEqual(top('in', 2), ['in', 'int'], 'symbol \\int before template \\intx');
});

test('aliases and names are searchable', () => {
  assert.ok(top('union', 3).includes('cup'), 'alias union → \\cup');
  assert.ok(top('ne', 3).includes('neq'));
  assert.ok(top('reals', 3).includes('RR'));
  assert.ok(top('integral', 3).includes('int'));
});

test('limit is respected and results are unique', () => {
  const r = E.getSuggestions('s', { limit: 5 });
  assert.equal(r.length, 5);
  assert.equal(new Set(r.map((e) => e.trigger)).size, 5);
});

test('garbage query gives no suggestions', () => {
  assert.deepEqual(E.getSuggestions('zzqqx'), []);
});
