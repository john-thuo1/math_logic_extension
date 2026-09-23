// Shared E2E plumbing: builds the fixture, serves it (plus a mock AI endpoint),
// and launches Chromium with the unpacked extension loaded.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const EXT = path.join(ROOT, 'extension');
const CACHE = path.join(HERE, '.cache');

export async function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  await build({ entryPoints: [path.join(HERE, 'fixtures/editors.src.js')], bundle: true, outfile: path.join(CACHE, 'editors.bundle.js'), logLevel: 'warning' });
  fs.copyFileSync(path.join(ROOT, 'node_modules/quill/dist/quill.snow.css'), path.join(CACHE, 'quill.snow.css'));
  fs.copyFileSync(path.join(HERE, 'fixtures/index.html'), path.join(CACHE, 'index.html'));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.zip': 'application/zip', '.svg': 'image/svg+xml' };

/**
 * Static server over `dir` + a fake OpenAI-compatible endpoint at /v1/chat/completions.
 * `ai.reply` (string) or `ai.status` (number) control the mock; `ai.requests` records bodies.
 */
export function serve(dir) {
  const ai = { reply: 'MOCK', status: 200, delay: 0, requests: [] };
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/v1/chat/completions')) {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        ai.requests.push(JSON.parse(body || '{}'));
        if (ai.delay) await new Promise((r) => setTimeout(r, ai.delay));
        res.writeHead(ai.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(ai.status === 200 ? { choices: [{ message: { content: ai.reply } }] } : { error: { message: 'mock failure ' + ai.status } }));
      });
      return;
    }
    const url = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(dir, url === '/' ? 'index.html' : url);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://localhost:${port}`, port, ai, close: () => new Promise((r) => server.close(r)) });
  }));
}
export const fixtureDir = () => CACHE;

export async function launchWithExtension() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mathlogic-e2e-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1000, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  return {
    ctx, sw, extId,
    /** Write extension settings the same way the options page does. */
    async setSettings(sync = {}, ai = null) {
      await sw.evaluate(async ([s, a]) => {
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(s);
        if (a) await chrome.storage.local.set({ ai: a }); else await chrome.storage.local.remove('ai');
      }, [sync, ai]);
    },
    async close() { await ctx.close(); },
  };
}

export const EDITORS = {
  ta: { sel: '#ta', kind: 'text' },
  inp: { sel: '#inp', kind: 'text', singleLine: true },
  ce: { sel: '#ce', kind: 'ce' },
  pm: { sel: '#pm .ProseMirror', kind: 'ce' },
  quill: { sel: '#quill .ql-editor', kind: 'ce' },
};

export function editorApi(page) {
  const api = {
    async text(key) {
      return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const t = 'value' in el && el.tagName !== 'DIV' ? el.value : el.innerText;
        return t.replace(/ /g, ' ').replace(/\n+$/, '');
      }, EDITORS[key]?.sel || key);
    },
    async clear(key) {
      const sel = EDITORS[key]?.sel || key;
      await page.focus(sel);
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      await page.evaluate(() => { window.sent.length = 0; });
      await api.settle();
    },
    type: (t) => page.keyboard.type(t, { delay: 15 }),
    press: (k) => page.keyboard.press(k),
    settle: (ms = 60) => page.waitForTimeout(ms),
    sent: () => page.evaluate(() => window.sent.slice()),
    popup: () => page.evaluate(() => {
      const h = document.querySelector('mathlogic-ui');
      const b = h && h.shadowRoot.querySelector('.box');
      if (!b || b.style.display !== 'block') return null;
      const r = b.getBoundingClientRect();
      return {
        items: [...b.querySelectorAll('.it .t')].map((x) => x.textContent.slice(1)),
        selected: [...b.querySelectorAll('.it')].findIndex((x) => x.classList.contains('on')),
        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      };
    }),
    toast: () => page.evaluate(() => {
      const h = document.querySelector('mathlogic-ui');
      const t = h && h.shadowRoot.querySelector('.toast');
      return t && t.style.display === 'block' ? { text: t.textContent, error: t.classList.contains('err') } : null;
    }),
    // the passive bracket warning (waits out its debounce)
    async check(wait = 900) {
      await page.waitForTimeout(wait);
      return page.evaluate(() => {
        const h = document.querySelector('mathlogic-ui');
        const c = h && h.shadowRoot.querySelector('.chk');
        return c && c.style.display === 'block' ? c.textContent : null;
      });
    },
    selectedText: () => page.evaluate(() => {
      const a = document.activeElement;
      if (a && 'selectionStart' in a && a.tagName !== 'DIV') return a.value.slice(a.selectionStart, a.selectionEnd);
      return String(window.getSelection());
    }),
  };
  return api;
}
