import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E } from './_engine.mjs';

const base = { apiKey: 'sk-test', model: '', baseUrl: '', preferAI: false };

test('each provider preset builds a valid OpenAI-compatible request', () => {
  const expect = {
    groq: ['https://api.groq.com/openai/v1/chat/completions', 'openai/gpt-oss-20b'],
    gemini: ['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'gemini-3.1-flash-lite'],
    openrouter: ['https://openrouter.ai/api/v1/chat/completions', 'openrouter/free'],
  };
  for (const [p, [url, model]] of Object.entries(expect)) {
    const r = E.buildAIRequest('x squared', 'UNICODE', { ...base, provider: p });
    assert.equal(r.url, url, p);
    assert.equal(r.init.method, 'POST');
    assert.equal(r.init.headers.Authorization, 'Bearer sk-test');
    assert.equal(r.init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(r.init.body);
    assert.equal(body.model, model);
    assert.equal(body.temperature, 0);
    assert.equal(body.messages.at(-1).content, 'x squared');
    assert.equal(body.messages[0].role, 'system');
  }
});

test('Groq gets low reasoning effort; others do not get unknown params', () => {
  assert.equal(JSON.parse(E.buildAIRequest('a', 'UNICODE', { ...base, provider: 'groq' }).init.body).reasoning_effort, 'low');
  for (const p of ['gemini', 'openrouter', 'custom']) {
    assert.equal(JSON.parse(E.buildAIRequest('a', 'UNICODE', { ...base, provider: p }).init.body).reasoning_effort, undefined, p);
  }
});

test('custom provider: base URL and model overrides, trailing slash, no key → no auth header', () => {
  const r = E.buildAIRequest('a', 'LATEX', { provider: 'custom', apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434/v1/' });
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(r.init.headers.Authorization, undefined);
  assert.equal(JSON.parse(r.init.body).model, 'llama3');
});

test('unknown provider falls back to Groq preset', () => {
  assert.match(E.buildAIRequest('a', 'UNICODE', { ...base, provider: 'nope' }).url, /groq/);
});

test('system prompt and few-shot example match the requested format', () => {
  const sys = (m) => JSON.parse(E.buildAIRequest('a', m, { ...base, provider: 'groq' }).init.body).messages;
  assert.match(sys('LATEX')[0].content, /LaTeX/);
  assert.match(sys('LATEX')[2].content, /\\forall/);
  assert.match(sys('ASCII')[2].content, /forall x in R/);
  assert.match(sys('UNICODE')[2].content, /∀x ∈ ℝ/);
});

test('parseAIResponse strips fences, quotes and $ delimiters', () => {
  const wrap = (c) => ({ choices: [{ message: { content: c } }] });
  assert.equal(E.parseAIResponse(wrap('```\n∀x ∈ ℝ\n```'), 'UNICODE'), '∀x ∈ ℝ');
  assert.equal(E.parseAIResponse(wrap('```latex\n\\int x\n```'), 'LATEX'), '\\int x');
  assert.equal(E.parseAIResponse(wrap('"x²"'), 'UNICODE'), 'x²');
  assert.equal(E.parseAIResponse(wrap('$x^2$'), 'UNICODE'), 'x^2');
  assert.equal(E.parseAIResponse(wrap('  x ≥ 0  '), 'UNICODE'), 'x ≥ 0');
});

test('parseAIResponse throws a readable error on empty / error payloads', () => {
  assert.throws(() => E.parseAIResponse({}, 'UNICODE'), /Empty AI response/);
  assert.throws(() => E.parseAIResponse({ error: { message: 'bad key' } }, 'UNICODE'), /bad key/);
  assert.throws(() => E.parseAIResponse({ choices: [{ message: { content: '' } }] }, 'UNICODE'));
});

test('callAI: success path uses the built request', async () => {
  let seen;
  const fakeFetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x²' } }] }) }; };
  const out = await E.callAI('x squared', 'UNICODE', { ...base, provider: 'groq' }, fakeFetch);
  assert.equal(out, 'x²');
  assert.match(seen.url, /groq/);
});

test('callAI: HTTP errors surface the provider message', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key' } }) });
  await assert.rejects(E.callAI('a', 'UNICODE', { ...base, provider: 'groq' }, fakeFetch), /Invalid API Key/);
  const noJson = async () => ({ ok: false, status: 503, json: async () => { throw new Error('not json'); } });
  await assert.rejects(E.callAI('a', 'UNICODE', { ...base, provider: 'groq' }, noJson), /HTTP 503/);
});

test('aiReady: AI is off until the user consents, and needs a key (or a local custom server)', () => {
  assert.equal(E.DEFAULT_SETTINGS.ai.consent, false, 'off by default');
  assert.equal(E.aiReady(E.DEFAULT_SETTINGS.ai), false);
  assert.equal(E.aiReady({ provider: 'groq', apiKey: 'gsk_x', consent: false }), false, 'key alone is not enough');
  assert.equal(E.aiReady({ provider: 'groq', apiKey: '', consent: true }), false, 'consent alone is not enough');
  assert.equal(E.aiReady({ provider: 'groq', apiKey: 'gsk_x', consent: true }), true);
  assert.equal(E.aiReady({ provider: 'custom', apiKey: '', consent: true }), true, 'local server needs no key');
  assert.equal(E.aiReady({ provider: 'groq', apiKey: 'gsk_x', consent: 'yes' }), false, 'only literal true counts');
  assert.equal(E.aiReady(null), false);
});

test('callAI: network failure rejects (caller falls back to offline)', async () => {
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(E.callAI('a', 'UNICODE', { ...base, provider: 'groq' }, boom), /Failed to fetch/);
});
