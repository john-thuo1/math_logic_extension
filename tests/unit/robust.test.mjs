// Robustness rules, each one checked rather than trusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { E } from './_engine.mjs';

const engineSrc = fs.readFileSync(new URL('../../extension/engine.js', import.meta.url), 'utf8');
const contentSrc = fs.readFileSync(new URL('../../extension/content.js', import.meta.url), 'utf8');

test('the engine stays pure: no DOM, no chrome, no timers', () => {
  const code = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const api of ['document', 'window', 'chrome.', 'localStorage', 'setTimeout', 'requestAnimationFrame']) {
    assert.equal(code.includes(api), false, 'engine.js must not reach for ' + api + ' — that belongs to the controller');
  }
  assert.match(code, /function callAI\(phrase, mode, ai, fetchImpl\)/, 'even fetch is passed in rather than reached for');
});

test('settings from storage are validated, never trusted', () => {
  const junk = E.normalizeSettings({
    mode: 'BOGUS', target: 'nope', latexDelims: 'sideways', disabledSites: 'not-an-array',
    customSnippets: 42, ai: { provider: 'evil', consent: 'yes', apiKey: 7, preferAI: 'sure' },
  });
  assert.equal(junk.mode, E.DEFAULT_SETTINGS.mode);
  assert.equal(junk.target, E.DEFAULT_SETTINGS.target);
  assert.equal(junk.latexDelims, E.DEFAULT_SETTINGS.latexDelims);
  assert.deepEqual(junk.disabledSites, []);
  assert.equal(typeof junk.customSnippets, 'string');
  assert.equal(junk.ai.provider, E.DEFAULT_SETTINGS.ai.provider);
  assert.equal(junk.ai.apiKey, '');
  assert.equal(junk.ai.consent, false, 'consent is never inferred from a truthy value');
  assert.equal(junk.ai.preferAI, false);
  assert.equal(E.aiReady(junk.ai), false);
});

test('normalizing keeps what is valid and is stable', () => {
  const mine = { mode: 'LATEX', target: 'spot', latexDelims: 'double', smartOps: false, disabledSites: ['a.com'] };
  const once = E.normalizeSettings(mine);
  assert.equal(once.mode, 'LATEX');
  assert.equal(once.target, 'spot');
  assert.equal(once.smartOps, false);
  assert.deepEqual(once.disabledSites, ['a.com']);
  assert.deepEqual(E.normalizeSettings(once), once, 'normalizing twice changes nothing');
});

test('every page listener is wrapped, so a bug cannot eat a keystroke', () => {
  assert.match(contentSrc, /this\._onKey = this\.guard\(/);
  for (const h of ['_onInput', '_onDown', '_onBlur', '_onScroll']) {
    assert.ok(contentSrc.includes('this.' + h + ' = this.guard('), h + ' is guarded');
  }
  assert.match(contentSrc, /Controller\.prototype\.guard = function/);
});

test('whole-document scans share one budget', () => {
  const uses = contentSrc.match(/SCAN_LIMIT/g) || [];
  assert.ok(uses.length >= 5, 'the limit is declared once and used everywhere: ' + uses.length);
  assert.equal(/\.length > 20000|\.length <= 20000/.test(contentSrc), false, 'no hand-written copy of the budget');
});

test('stored settings carry a version a future migration can read', () => {
  assert.equal(typeof E.SETTINGS_VERSION, 'number');
  assert.equal(E.DEFAULT_SETTINGS.version, E.SETTINGS_VERSION);
  assert.equal(E.normalizeSettings({}).version, E.SETTINGS_VERSION);
  // a profile written before versions existed is brought forward, not discarded
  const old = E.normalizeSettings({ mode: 'LATEX', smartOps: false, disabledSites: ['a.com'] });
  assert.equal(old.version, E.SETTINGS_VERSION);
  assert.equal(old.mode, 'LATEX');
  assert.equal(old.smartOps, false);
  assert.deepEqual(old.disabledSites, ['a.com']);
  // a version from a build that does not exist yet is not trusted blindly
  assert.equal(E.migrateSettings({ version: 99 }).version, E.SETTINGS_VERSION);
});

test('delays live in one table', () => {
  for (const k of ['settle', 'blur', 'check', 'toast', 'toastError', 'save']) {
    assert.equal(typeof E.TIMING[k], 'number', k + ' has a delay');
  }
  assert.ok(E.TIMING.check > E.TIMING.blur, 'the formula check waits longer than a focus bounce');
  assert.ok(E.TIMING.toastError > E.TIMING.toast, 'an error stays on screen longer');
  const bare = contentSrc.match(/setTimeout\([^,]*,\s*\d+\s*\)/g) || [];
  assert.deepEqual(bare, [], 'no hand-written delays in the controller: ' + bare.join(', '));
});
