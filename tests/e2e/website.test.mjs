// The marketing/demo website: built with Vite, served statically, exercised in Chromium.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { ROOT, serve, launchWithExtension } from './helpers.mjs';

const OUT = path.join(ROOT, 'tests/e2e/.cache/site');
let srv, browser;

before(async () => {
  execFileSync('npm', ['run', '-s', 'zip:ext'], { cwd: ROOT }); // the site must ship the current extension
  // configFile is explicit: vite looks for it next to `root` otherwise, and the
  // config lives one level up
  await build({
    configFile: path.join(ROOT, 'vite.config.ts'),
    root: path.join(ROOT, 'site'),
    logLevel: 'error',
    build: { outDir: OUT, emptyOutDir: true },
  });
  srv = await serve(OUT);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await srv?.close(); });

async function openSite(viewport = { width: 1200, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.composer');
  return { page, ctx, errors };
}
const composerText = (page) => page.evaluate(() => document.querySelector('.composer').innerText.replace(/\u00a0/g, ' ').trim());
const type = (page, t) => page.keyboard.type(t, { delay: 15 });

describe('website without the extension', () => {
  test('loads without script errors and ships the extension zip', async () => {
    const { page, ctx, errors } = await openSite();
    assert.deepEqual(errors, []);
    assert.match(await page.textContent('h1'), /Type math into ChatGPT/);
    const zip = await page.request.get(srv.url + '/mathlogic-extension.zip');
    assert.equal(zip.status(), 200);
    assert.equal((await zip.body()).subarray(0, 2).toString(), 'PK', 'is a zip');
    // the published privacy policy is the one bundled in the extension
    const pol = await page.request.get(srv.url + '/privacy.html');
    assert.equal(pol.status(), 200);
    assert.equal(await pol.text(), fs.readFileSync(path.join(ROOT, 'extension/privacy.html'), 'utf8'));
    assert.equal(await page.getAttribute('footer a', 'href'), '/privacy.html');
    // the zip must contain the current extension, byte for byte
    for (const f of ['manifest.json', 'engine.js', 'content.js', 'background.js']) {
      const inZip = execFileSync('unzip', ['-p', path.join(OUT, 'mathlogic-extension.zip'), f]);
      assert.ok(inZip.equals(fs.readFileSync(path.join(ROOT, 'extension', f))), `${f} in zip is stale`);
    }
    await ctx.close();
  });

  test('demo composer behaves like the extension (symbols, smart ops, /math, send)', async () => {
    const { page, ctx } = await openSite();
    await page.focus('.composer');
    await type(page, 'Why is /math sum of 1/n^2 from n=1 to infinity');
    await page.keyboard.press('Enter');
    await type(page, ' equal to \\pi^2/6?');
    assert.equal(await composerText(page), 'Why is ∑_(n=1)^∞ 1/n² equal to π²/6?');
    await page.keyboard.press('Enter'); // now it sends
    await page.waitForTimeout(100);
    assert.equal(await composerText(page), '');
    assert.match(await page.textContent('main'), /Why is ∑_\(n=1\)\^∞ 1\/n² equal to π²\/6\?/);
    await ctx.close();
  });

  test('output format switch applies immediately and is remembered', async () => {
    const { page, ctx } = await openSite();
    await page.click('button:has-text("LaTeX")');
    await page.focus('.composer');
    await type(page, '\\RR ');
    assert.equal(await composerText(page), '\\mathbb{R}');
    await page.reload();
    await page.waitForSelector('.composer');
    await page.focus('.composer');
    await type(page, '\\alpha ');
    assert.equal(await composerText(page), '\\alpha');
    await page.click('button:has-text("Unicode")');
    await ctx.close();
  });

  test('example chips load text ready to convert', async () => {
    const { page, ctx } = await openSite();
    await page.click('button:has-text("/math limit of sin(x)/x")');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert.equal(await composerText(page), 'Explain why lim_(x→0) sin(x)/x');
    await ctx.close();
  });

  // (Scroll events are not delivered in headless extension contexts, so the
  //  shared controller's scroll-following is verified here, on the website.)
  test('suggestion popup follows the caret when the page scrolls', async () => {
    const { page, ctx } = await openSite();
    await page.focus('.composer');
    await type(page, '\\alp'); // few matches → short popup that won't flip sides when scrolled
    await page.waitForTimeout(80);
    const top = () => page.evaluate(() => document.querySelector('mathlogic-ui').shadowRoot.querySelector('.box').getBoundingClientRect().top);
    const a = await top();
    await page.evaluate(() => window.scrollBy(0, 100));
    await page.waitForTimeout(150);
    const b = await top();
    assert.ok(Math.abs(a - b - 100) < 3, `moved ${a - b}px`);
    await ctx.close();
  });

  test('"Open in ChatGPT / Claude" pre-fills the question', async () => {
    const { page, ctx } = await openSite();
    await page.focus('.composer');
    await type(page, '\\forall x');
    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
    await page.click('button:has-text("Open in ChatGPT")');
    await page.click('button:has-text("Open in Claude")');
    const opened = await page.evaluate(() => window.__opened);
    assert.equal(opened[0], 'https://chatgpt.com/?q=' + encodeURIComponent('∀x'));
    assert.equal(opened[1], 'https://claude.ai/new?q=' + encodeURIComponent('∀x'));
    await ctx.close();
  });

  test('dictionary search filters, and the search box itself is not autocorrected', async () => {
    const { page, ctx } = await openSite();
    const search = page.locator('input[placeholder^="Search"]');
    await search.focus();
    await type(page, 'integral');
    assert.equal(await search.inputValue(), 'integral');
    const items = await page.locator('#dictionary button span.font-mono').allTextContents();
    assert.ok(items.includes('\\int') && items.includes('\\intab'));
    assert.ok(!items.includes('\\alpha'));
    await ctx.close();
  });

  test('automata labels in the dictionary are fully visible, not clipped', async () => {
    for (const vp of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
      const { page, ctx } = await openSite(vp);
      await page.locator('#dictionary button', { hasText: /^Automata$/ }).click();
      const tiles = await page.$$eval('#dictionary [data-glyph]', (els) => els.map((el) => ({
        t: el.textContent, clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 })));
      assert.ok(tiles.length >= 24, 'automata entries shown: ' + tiles.length);
      for (const g of tiles) assert.equal(g.clipped, false, 'clipped label ' + g.t + ' at ' + vp.width);
      assert.ok(tiles.some((g) => g.t === 'DFA') && tiles.some((g) => g.t === 'Mealy'));
      await ctx.close();
    }
  });

  test('the website inspector draws the same tree as the engine', async () => {
    const { page, ctx } = await openSite();
    await page.click('#inspector button:has-text("checkpoint inside the rule")');
    await page.waitForTimeout(100);
    assert.match(await page.textContent('#inspector pre'), /^G\n└─ IMPLIES/);
    await page.click('#inspector button:has-text("checkpoint beside the rule")');
    await page.waitForTimeout(100);
    assert.match(await page.textContent('#inspector pre'), /^AND\n├─ G/);
    await page.click('#inspector button:has-text("a bracket left open")');
    await page.waitForTimeout(100);
    assert.match(await page.textContent('#inspector'), /ERROR · 1 unclosed/);
    await ctx.close();
  });

  test('recipes section lists every recipe', async () => {
    const { page, ctx } = await openSite();
    const n = await page.evaluate(() => globalThis.MathLogicEngine.RECIPES.length);
    assert.equal(await page.locator('#recipes [data-recipe]').count(), n);
    assert.match(await page.textContent('#recipes'), /Ask about a DFA/);
    await ctx.close();
  });

  test('mobile width: no horizontal scrolling', async () => {
    const { page, ctx } = await openSite({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await ctx.close();
  });
});

describe('website with the extension installed', () => {
  let ext;
  before(async () => { ext = await launchWithExtension(); });
  after(async () => { await ext?.close(); });

  test('detects the extension and never double-converts', async () => {
    const page = await ext.ctx.newPage();
    await page.goto(srv.url + '/');
    await page.waitForSelector('text=Extension active');
    await page.focus('.composer');
    await type(page, '\\alpha x^2 ');
    assert.equal(await composerText(page), 'α x²');
    await page.close();
  });
});
