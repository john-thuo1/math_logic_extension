// The extension's own pages: toolbar popup and the settings/options page.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, fixtureDir, buildFixture, launchWithExtension } from './helpers.mjs';

let ext, srv;
before(async () => { await buildFixture(); srv = await serve(fixtureDir()); ext = await launchWithExtension(); });
after(async () => { await ext?.close(); await srv?.close(); });

const storage = () => ext.sw.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));

async function open(file, viewport) {
  const p = await ext.ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  if (viewport) await p.setViewportSize(viewport);
  await p.goto(`chrome-extension://${ext.extId}/${file}`);
  await p.waitForLoadState('domcontentloaded');
  await p.waitForTimeout(200);
  return { p, errors };
}

describe('toolbar popup', () => {
  before(() => ext.setSettings({}));

  test('renders without errors and reflects defaults', async () => {
    const { p, errors } = await open('popup.html', { width: 340, height: 640 });
    assert.deepEqual(errors, []);
    assert.equal(await p.isChecked('#enabled'), true);
    assert.equal(await p.isChecked('#smartOps'), true);
    assert.equal(await p.getAttribute('#modes button.on', 'data-m'), 'UNICODE');
    assert.match(await p.textContent('#aiPill'), /offline only/);
    await p.close();
  });

  test('mode buttons and toggles write to synced storage', async () => {
    const { p } = await open('popup.html', { width: 340, height: 640 });
    await p.click('#modes button[data-m="LATEX"]');
    await p.click('#smartOps + i');
    await p.click('#enabled + i');
    await p.waitForTimeout(150);
    const { sync } = await storage();
    assert.equal(sync.mode, 'LATEX');
    assert.equal(sync.smartOps, false);
    assert.equal(sync.enabled, false);
    assert.equal(await p.getAttribute('#modes button.on', 'data-m'), 'LATEX');
    assert.match(await p.textContent('#modeHint'), /LaTeX/);
    await p.close();
    await ext.setSettings({});
  });

  test('site switch is disabled on non-web pages (no hostname to pause)', async () => {
    const { p } = await open('popup.html', { width: 340, height: 640 });
    assert.equal(await p.isDisabled('#siteOn'), true);
    await p.close();
  });
});

describe('options page', () => {
  before(() => ext.setSettings({}));

  test('renders without errors; cheat sheet lists every shortcut', async () => {
    const { p, errors } = await open('options.html');
    assert.deepEqual(errors, []);
    const rows = await p.locator('#rows tr').count();
    const total = await ext.sw.evaluate(() => MathLogicEngine.SYMBOLS.length + MathLogicEngine.TEMPLATES.length + MathLogicEngine.parseCustomSnippets(MathLogicEngine.DEFAULT_SETTINGS.customSnippets).length);
    assert.equal(rows, total);
    await p.close();
  });

  test('recipes are shown, and the cheat sheet explains how to use each entry', async () => {
    const { p } = await open('options.html');
    const n = await ext.sw.evaluate(() => MathLogicEngine.RECIPES.length);
    assert.equal(await p.locator('#recipes .recipe').count(), n);
    assert.match(await p.textContent('#recipes .recipe[data-id="dfa"]'), /\\dfadef/);
    await p.fill('#q', 'dfadef');
    assert.match(await p.textContent('#rows'), /Fill each box with Tab/);
    await p.close();
  });

  test('cheat sheet search and category filters', async () => {
    const { p } = await open('options.html');
    await p.fill('#q', 'union');
    const txt = await p.textContent('#rows');
    assert.match(txt, /\\cup/);
    assert.doesNotMatch(txt, /\\alpha/);
    await p.fill('#q', '');
    await p.click('#cats button[data-c="Greek"]');
    const n = await p.locator('#rows tr').count();
    const greek = await ext.sw.evaluate(() => MathLogicEngine.SYMBOLS.filter((s) => s.category === 'Greek').length);
    assert.equal(n, greek);
    await p.close();
  });

  test('playground uses the real controller', async () => {
    const { p } = await open('options.html');
    await p.focus('#play');
    await p.keyboard.type('\\forall x \\in \\RR, x^2 >= 0 ', { delay: 15 });
    assert.equal((await p.innerText('#play')).replace(/ /g, ' ').trim(), '∀x ∈ ℝ, x² ≥ 0');
    await p.close();
  });

  test('provider switch updates model placeholder, key link and help', async () => {
    const { p } = await open('options.html');
    await p.selectOption('#provider', 'gemini');
    assert.equal(await p.getAttribute('#model', 'placeholder'), 'gemini-3.1-flash-lite');
    assert.match(await p.getAttribute('#keyLink', 'href'), /aistudio\.google\.com/);
    assert.equal(await p.isVisible('#baseWrap'), false);
    await p.selectOption('#provider', 'custom');
    assert.equal(await p.isVisible('#baseWrap'), true);
    await p.selectOption('#provider', 'groq');
    assert.equal(await p.getAttribute('#model', 'placeholder'), 'openai/gpt-oss-20b');
    await p.close();
  });

  test('API key is stored locally only (never in synced storage)', async () => {
    const { p } = await open('options.html');
    await p.selectOption('#provider', 'groq');
    await p.fill('#apiKey', 'gsk_secret_123');
    // Save & test will try to reach Groq; we only assert on what was stored.
    await p.click('#saveAI');
    await p.waitForTimeout(300);
    const { sync, local } = await storage();
    assert.equal(local.ai.apiKey, 'gsk_secret_123');
    assert.doesNotMatch(JSON.stringify(sync), /gsk_secret_123/);
    await p.close();
    await ext.setSettings({});
  });

  test('Save & test against a working (mock) endpoint reports success', async () => {
    srv.ai.reply = '∀ε > 0 ∃δ > 0';
    const { p } = await open('options.html');
    await p.selectOption('#provider', 'custom');
    await p.fill('#baseUrl', srv.url + '/v1');
    await p.fill('#model', 'mock');
    // custom endpoints ask for host permission; localhost is pre-granted in the manifest
    await p.check('#consent');
    await p.click('#saveAI');
    await p.waitForFunction(() => /Works|❌/.test(document.getElementById('status').textContent), null, { timeout: 5000 });
    assert.match(await p.textContent('#status'), /Works: ∀ε > 0 ∃δ > 0/);
    await p.close();
    await ext.setSettings({});
  });

  test('ticking the consent box never wipes a key or URL typed but not yet saved', async () => {
    const { p } = await open('options.html');
    await p.selectOption('#provider', 'groq');
    await p.fill('#apiKey', 'gsk_typed_not_saved');
    await p.fill('#model', 'my-model');
    await p.check('#consent');
    await p.check('#preferAI');
    assert.equal(await p.inputValue('#apiKey'), 'gsk_typed_not_saved');
    assert.equal(await p.inputValue('#model'), 'my-model');
    await p.close();
    await ext.setSettings({});
  });

  test('AI stays off until the disclosure is accepted; unticking turns it off again', async () => {
    srv.ai.requests.length = 0;
    const { p } = await open('options.html');
    assert.equal(await p.isVisible('#disclosure'), true, 'disclosure shown before any key is entered');
    assert.match(await p.textContent('#disclosure'), /Only the phrase you're converting/);
    assert.equal(await p.isChecked('#consent'), false, 'off by default');
    await p.selectOption('#provider', 'custom');
    await p.fill('#baseUrl', srv.url + '/v1');
    await p.click('#saveAI');
    await p.waitForTimeout(300);
    assert.match(await p.textContent('#status'), /Tick/);
    assert.equal(srv.ai.requests.length, 0, 'no test call without consent');
    assert.match(await p.textContent('#aiPill'), /offline only/);
    await p.check('#consent');
    await p.waitForTimeout(150);
    assert.equal((await storage()).local.ai.consent, true);
    assert.match(await p.textContent('#aiPill'), /offline \+ AI/);
    await p.uncheck('#consent');
    await p.waitForTimeout(150);
    assert.equal((await storage()).local.ai.consent, false);
    assert.match(await p.textContent('#status'), /AI conversion is off/);
    await p.close();
    await ext.setSettings({});
  });

  test('privacy policy is bundled and linked from Settings', async () => {
    const { p } = await open('options.html');
    assert.equal(await p.getAttribute('#disclosure a', 'href'), 'privacy.html');
    await p.goto(`chrome-extension://${ext.extId}/privacy.html`);
    assert.match(await p.textContent('h1'), /Privacy/);
    await p.close();
  });

  test('delimiter choice persists and is disabled when wrapping is off', async () => {
    const { p } = await open('options.html');
    assert.equal(await p.inputValue('#latexDelims'), 'auto');
    await p.selectOption('#latexDelims', 'paren');
    await p.waitForTimeout(150);
    assert.equal((await storage()).sync.latexDelims, 'paren');
    await p.uncheck('#wrapLatex');
    assert.equal(await p.isDisabled('#latexDelims'), true);
    await p.close();
    await ext.setSettings({});
  });

  test('target syntax persists, explains itself and retypes the cheat sheet', async () => {
    const { p } = await open('options.html');
    assert.equal(await p.inputValue('#target'), 'generic');
    const asciiOf = (trigger) => p.$$eval('#rows tr', (rows, t) => {
      const tr = rows.find((r) => r.children[1] && r.children[1].textContent === '\\' + t);
      return tr ? tr.children[4].textContent : null;
    }, trigger);
    await p.fill('#q', 'next');
    await p.waitForTimeout(100);
    assert.equal(await asciiOf('Xw'), 'WX', 'generic ASCII writes weak next as WX');
    assert.equal(await asciiOf('Xs'), 'X');
    assert.equal(await asciiOf('X'), 'X', 'plain next is always the bare letter');
    await p.selectOption('#target', 'spot');
    await p.waitForTimeout(150);
    assert.equal((await storage()).sync.target, 'spot');
    assert.match(await p.textContent('#targetHelp'), /X\[!\]/);
    await p.fill('#q', 'next');
    await p.waitForTimeout(100);
    assert.equal(await asciiOf('Xw'), 'X', 'Spot writes weak next as plain X');
    assert.equal(await asciiOf('Xs'), 'X[!]', 'and strong next as X[!]');
    await p.close();
    await ext.setSettings({});
  });

  test('the formula inspector shows the scope of what you paste', async () => {
    const { p } = await open('options.html');
    const tree = async (t) => { await p.fill('#finput', t); await p.waitForTimeout(80); return p.textContent('#ftree'); };
    const beside = await tree('G(start -> (X(processing) & F(done))) & F(checkpoint)');
    assert.match(beside, /^AND\n├─ G\n/, 'checkpoint is a sibling of the rule');
    assert.match(await p.textContent('#ftop'), /top level: AND of 2/);
    const inside = await tree('G(start -> (X(processing) & F(done) & F(checkpoint)))');
    assert.match(inside, /^G\n└─ IMPLIES\n/, 'here it sits inside the rule');
    assert.match(await p.textContent('#ftop'), /top level: G/);
    await tree('G((request & !error) -> F(grant)');
    assert.match(await p.textContent('#fissue'), /ERROR · 1 unclosed/);
    assert.equal((await p.textContent('#ftree')).trim(), '', 'a formula that does not parse has no tree');
    await p.close();
  });

  test('the bracket check can be switched off from Settings', async () => {
    const { p } = await open('options.html');
    assert.equal(await p.isChecked('#bracketCheck'), true);
    await p.uncheck('#bracketCheck');
    await p.waitForTimeout(150);
    assert.equal((await storage()).sync.bracketCheck, false);
    await p.close();
    await ext.setSettings({});
  });

  test('custom shortcuts and paused sites persist', async () => {
    const { p } = await open('options.html');
    await p.fill('#custom', 'ker = \\ker');
    await p.fill('#sites', 'docs.google.com\n  overleaf.com ');
    await p.waitForTimeout(700); // typing is debounced: chrome.storage.sync has a write quota
    const { sync } = await storage();
    assert.equal(sync.customSnippets, 'ker = \\ker');
    assert.deepEqual(sync.disabledSites, ['docs.google.com', 'overleaf.com']);
    await p.close();
    await ext.setSettings({});
  });
});
