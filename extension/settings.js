/* Settings storage shared by popup.html and options.html.
 * Everything syncs across your Chrome profile except the AI block (API key),
 * which stays in local storage on this machine only. */
(function (root) {
  var E = root.MathLogicEngine;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  root.MathLogicSettings = {
    load: function () {
      return new Promise(function (resolve) {
        chrome.storage.sync.get(null, function (sync) {
          chrome.storage.local.get('ai', function (local) {
            var s = Object.assign(clone(E.DEFAULT_SETTINGS), sync || {});
            s.ai = Object.assign(clone(E.DEFAULT_SETTINGS.ai), (local && local.ai) || {});
            resolve(s);
          });
        });
      });
    },
    save: function (s) {
      var sync = Object.assign({}, s);
      var ai = sync.ai;
      delete sync.ai;
      return Promise.all([
        new Promise(function (r) { chrome.storage.sync.set(sync, r); }),
        new Promise(function (r) { chrome.storage.local.set({ ai: ai }, r); })
      ]);
    }
  };
})(globalThis);
