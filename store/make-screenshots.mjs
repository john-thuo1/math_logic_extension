// Generates the Chrome Web Store images from the REAL extension running in Chromium.
//   npm run store:images
// Output: store/screenshot-*.png (1280×800) and store/promo-small-440x280.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launchWithExtension } from '../tests/e2e/helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOWCASE = path.join(HERE, 'showcase');
const out = (f) => path.join(HERE, f);

const srv = await serve(SHOWCASE);
const ext = await launchWithExtension();
await ext.setSettings({}); // defaults: Unicode, smart operators on, AI off

const page = await ext.ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(srv.url + '/index.html');
await page.waitForFunction(() => document.documentElement.dataset.mathlogicExt === '1');
await page.evaluate(() => document.fonts.ready);
const type = (t) => page.keyboard.type(t, { delay: 20 });
const scene = (title, sub, msgs) => page.evaluate(([a, b, c]) => window.setScene(a, b, c), [title, sub, msgs]);

// 1 — suggestions popup
await scene('Type <code>\\forall</code> → ∀, anywhere you write',
  'Suggestions appear as you type in ChatGPT, Claude, Gemini and any other text box.',
  [['me', 'Show that the sequence 1/n converges to 0.'],
   ['ai', 'Fix ε > 0. We need an N with 1/n < ε for every n ≥ N. By the Archimedean property, such an N exists…']]);
await type('Prove: \\forall \\epsilon > 0 \\exists N \\in \\NN such that n >= N -> |1/n| < \\eps');
await page.waitForTimeout(250);
await page.screenshot({ path: out('screenshot-1-suggestions.png') });

// 2 — /math plain English
await scene('Plain English → notation',
  'Type <code>/math</code> and what you mean, then press Enter. Enter never sends your message by accident.',
  [['me', 'Is ∀x ∈ ℝ, x² ≥ 0 still true if x is complex?'],
   ['ai', 'No. For x = i we get x² = −1 < 0, so the statement only holds over ℝ.']]);
await type('Why does /math sum of 1/n^2 from n=1 to infinity');
await page.keyboard.press('Enter');
await type(' equal \\pi^2/6?');
await page.waitForTimeout(200);
await page.screenshot({ path: out('screenshot-2-math-command.png') });

// 3 — templates with Tab slots
await scene('Templates with slots',
  '<code>\\intab</code>, <code>\\sumto</code>, <code>\\lim</code>, <code>\\mat2</code>, set-builder and more. Press Tab to jump to the next ⬚.',
  [['me', 'Can you check my integral?']]);
await type('Evaluate \\intab ');
await type('0'); await page.keyboard.press('Tab');
await type('\\pi'); await page.keyboard.press('Tab'); // pick π from the popup
await page.keyboard.press('Tab');                     // next slot
await type('sin(x)'); await page.keyboard.press('Tab'); // last slot is now selected
await page.waitForTimeout(200);
await page.screenshot({ path: out('screenshot-3-templates.png') });

// 4 — settings page (framed)
const opt = await ext.ctx.newPage();
await opt.setViewportSize({ width: 1200, height: 668 });
await opt.goto(`chrome-extension://${ext.extId}/options.html`);
await opt.waitForTimeout(300);
await opt.focus('#play');
await opt.keyboard.type('\\forall x \\in \\RR, x^2 >= 0 ', { delay: 10 });
// show the output format, the target syntax and the formula check together
await opt.evaluate(() => document.querySelector('#modes').scrollIntoView({ block: 'start' }));
await opt.waitForTimeout(200);
const settingsRaw = await opt.screenshot();

// 6 - formula inspector, on the settings page
await opt.evaluate(() => document.querySelector('#inspect').scrollIntoView({ block: 'start' }));
await opt.focus('#finput');
await opt.keyboard.type('G(start -> (X(processing) & F(done))) & F(checkpoint)', { delay: 6 });
await opt.waitForTimeout(250);
const inspectRaw = await opt.screenshot();

// 5 — toolbar popup (framed)
const pop = await ext.ctx.newPage();
await pop.setViewportSize({ width: 340, height: 610 });
await pop.goto(`chrome-extension://${ext.extId}/popup.html`);
await pop.waitForTimeout(300);
// Opened standalone, the popup has no web tab to describe; show it as it looks on a chat site.
await pop.evaluate(() => {
  document.getElementById('site').textContent = 'chatgpt.com';
  document.getElementById('siteHint').textContent = 'Active on this site';
  document.getElementById('siteOn').disabled = false;
});
const popupRaw = await pop.screenshot();

const frame = await ext.ctx.newPage();
await frame.setViewportSize({ width: 1280, height: 800 });
await frame.goto(srv.url + '/frame.html');
await frame.evaluate(() => document.fonts.ready);
const dataUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');
await frame.evaluate((o) => window.setFrame(o), {
  title: 'Settings that stay out of your way',
  sub: 'Unicode, LaTeX, ASCII or Auto output, a target syntax for your tool, and a formula check',
  src: dataUrl(settingsRaw),
});
await frame.screenshot({ path: out('screenshot-4-settings.png') });
await frame.evaluate((o) => window.setFrame(o), {
  title: 'Private by design',
  sub: 'Runs in your browser. No accounts, no tracking, no server of our own.',
  side: true,
  points: '<h2>One click away</h2><ul>' +
    '<li><b>On or off</b> everywhere, or pause it on a single site</li>' +
    '<li><b>Switch output format</b>: Unicode, LaTeX, ASCII, Auto</li>' +
    '<li><b>Works offline.</b> AI help is optional, off by default, and uses your own key</li></ul>',
  src: dataUrl(popupRaw),
});
await frame.screenshot({ path: out('screenshot-5-popup.png') });
await frame.evaluate((o) => window.setFrame(o), {
  title: 'See what sits inside what',
  sub: 'The inspector shows the structure of a formula, so a misplaced bracket cannot hide',
  src: dataUrl(inspectRaw),
});
await frame.screenshot({ path: out('screenshot-6-inspector.png') });

// promo tile
const promo = await ext.ctx.newPage();
await promo.setViewportSize({ width: 440, height: 280 });
await promo.goto(srv.url + '/promo.html');
await promo.evaluate(() => document.fonts.ready);
await promo.screenshot({ path: out('promo-small-440x280.png') });

await ext.close();
await srv.close();
console.log('Store images written to', HERE);
