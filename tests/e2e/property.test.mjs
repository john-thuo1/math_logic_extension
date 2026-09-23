// Property test: an insertion is a clean replacement or nothing at all.
//
// For random surrounding text and a random caret position, accepting a shortcut
// must leave exactly prefix + output + suffix. Never a partial edit, never a
// stray character, never text lost on either side of the caret.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture, serve, fixtureDir, launchWithExtension, editorApi } from './helpers.mjs';

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
  await ext.setSettings({});
  await page.waitForTimeout(150);
});
after(async () => { await ext?.close(); await srv?.close(); });

// A seeded generator keeps any failure reproducible.
function rng(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

// Awkward on purpose: brackets the checker reads, a placeholder the slot logic
// looks for, characters the smart operators watch.
const CHUNKS = ['', 'given ', 'x ', '(a) ', 'f(x) ', '∀y ', PH + ' ', 'p ∧ q ', '"q" ', 'a_1 ', '— ', 'δ(q,a) '];
// A box sitting right after the caret is filled by what you type, which is the
// point of the slots, so it is pinned in its own test instead of sampled here.
const TAILS = CHUNKS.filter((c) => !c.includes(PH));
const CASES = [
  { keys: '\\alpha', accept: 'Tab', out: 'α' },
  { keys: '\\in', accept: 'Tab', out: '∈' },
  { keys: '\\RR', accept: 'Tab', out: 'ℝ' },
  { keys: '\\frac', accept: 'Tab', out: `(${PH})/(${PH})` },
  { keys: '\\sumover', accept: 'Tab', out: `∑_(${PH}) ${PH}` },
  { keys: '\\Gof', accept: 'Tab', out: `G(${PH})` },
  { keys: '\\dfa', accept: 'Space', out: 'M = (Q, Σ, δ, q₀, F), δ: Q × Σ → Q' },
];

const sample = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

describe('insertions are clean replacements', () => {
  for (const key of ['ta', 'ce', 'pm']) {
    test(`${key}: text on both sides of the caret survives every insertion`, async () => {
      const rand = rng(20260923);
      for (let i = 0; i < 24; i++) {
        const prefix = sample(rand, CHUNKS) + sample(rand, CHUNKS);
        const suffix = sample(rand, TAILS).trim();
        const c = sample(rand, CASES);

        // The surrounding text is whatever the editor ends up holding: smart
        // operators may rewrite it (a_1 → a₁) and that is not what we measure.
        await ed.clear(key);
        let tail = '';
        if (suffix) {
          await ed.type(suffix);
          tail = await ed.text(key);
          for (let k = 0; k < tail.length; k++) await ed.press('ArrowLeft');
        }
        if (prefix) await page.keyboard.type(prefix, { delay: 5 });
        const base = await ed.text(key);
        const head = base.slice(0, base.length - tail.length);

        await ed.type(c.keys);
        await ed.settle();
        await ed.press(c.accept);
        await ed.settle();

        const want = head + c.out + (c.accept === 'Space' ? ' ' : '') + tail;
        assert.equal(await ed.text(key), want,
          `case ${i}: ${c.keys} typed into ${JSON.stringify(head)}|${JSON.stringify(tail)}`);
      }
    });
  }

  test('a rejected suggestion leaves the text exactly as typed', async () => {
    const rand = rng(7);
    for (let i = 0; i < 8; i++) {
      await ed.clear('ta');
      await ed.type(sample(rand, CHUNKS));
      const head = await ed.text('ta');
      await ed.type('\\alpha');
      await ed.press('Escape');
      assert.equal(await ed.text('ta'), head + '\\alpha', 'Esc keeps what was typed, character for character');
    }
  });

  test('typing into a box right after the caret fills that box', async () => {
    await ed.clear('ta');
    await ed.type('start \\frac');
    await ed.settle();
    await ed.press('Tab');
    await ed.type('\\alpha');
    await ed.settle();
    await ed.press('Tab');
    assert.equal(await ed.text('ta'), `start (α)/(${PH})`, 'the box became the insertion, it did not gain a sibling');
  });

  test('filling a box replaces the box and nothing around it', async () => {
    await ed.clear('ta');
    await ed.type('start \\frac');
    await ed.settle();
    await ed.press('Tab');
    await ed.type('1');
    await ed.press('Tab');
    await ed.type('2');
    assert.equal(await ed.text('ta'), 'start (1)/(2)');
  });

  test('an insertion consumes its trigger and nothing more', async () => {
    for (const c of CASES) {
      await ed.clear('ta');
      await ed.type('head ');
      await ed.type(c.keys);
      await ed.settle();
      const before = await ed.text('ta');
      await ed.press(c.accept);
      await ed.settle();
      const after = await ed.text('ta');
      const delta = after.length - (before.length - c.keys.length);
      assert.equal(delta, c.out.length + (c.accept === 'Space' ? 1 : 0), `${c.keys} replaced exactly its trigger`);
    }
  });
});
