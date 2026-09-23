/* MathLogic service worker: performs AI conversions so API keys never touch web pages. */
importScripts('engine.js');
var E = self.MathLogicEngine;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'mathlogic-ai') return;
  chrome.storage.local.get('ai', function (data) {
    var ai = Object.assign({}, E.DEFAULT_SETTINGS.ai, (data && data.ai) || {});
    if (!E.aiReady(ai)) { // enforced here too, not only in the page
      sendResponse({ ok: false, error: ai.consent ? 'no API key set' : 'AI conversion is turned off' });
      return;
    }
    E.callAI(msg.phrase, msg.mode, ai).then(
      function (text) { sendResponse({ ok: true, text: text }); },
      function (err) { sendResponse({ ok: false, error: String((err && err.message) || err) }); }
    );
  });
  return true; // async response
});

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
