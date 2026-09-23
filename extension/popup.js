(function () {
  var E = MathLogicEngine, S = MathLogicSettings;
  var host = '';
  var s;

  function $(id) { return document.getElementById(id); }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // the mode buttons are the engine's table, rendered
  $('modes').innerHTML = E.MODE_INFO.map(function (m) {
    return '<button data-m="' + esc(m.id) + '"><b>' + esc(m.label) + '</b><span>' + esc(m.short) + '</span></button>';
  }).join('');
  function paint() {
    $('enabled').checked = s.enabled !== false;
    $('smartOps').checked = s.smartOps !== false;
    var siteOn = s.disabledSites.indexOf(host) < 0;
    $('siteOn').checked = siteOn;
    $('siteOn').disabled = !host;
    $('site').textContent = host || 'this page';
    $('siteHint').textContent = !host ? 'Not available on this page' : siteOn ? 'Active on this site' : 'Paused on this site';
    Array.prototype.forEach.call(document.querySelectorAll('#modes button'), function (b) {
      b.classList.toggle('on', b.dataset.m === s.mode);
    });
    $('modeHint').textContent = E.modeInfo(s.mode).hint;
    var p = E.PROVIDERS[s.ai.provider] || E.PROVIDERS.groq;
    var hasAI = E.aiReady(s.ai);
    $('aiPill').textContent = hasAI ? 'offline + AI' : 'offline only';
    $('aiPill').className = 'pill ' + (hasAI ? 'ok' : 'warn');
    $('aiHint').textContent = hasAI
      ? 'Simple phrases convert instantly offline; tricky ones use ' + p.label.replace(/ \(.*/, '') + ' (' + (s.ai.model || p.model) + ').'
      : 'Common phrases convert offline. Turn on AI conversion in Settings to handle any phrasing.';
  }
  function save() { S.save(s); paint(); }

  S.load().then(function (loaded) {
    s = loaded;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      try { var u = new URL(tabs[0].url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch (e) {}
      paint();
    });
    paint();
  });

  $('enabled').onchange = function () { s.enabled = this.checked; save(); };
  $('smartOps').onchange = function () { s.smartOps = this.checked; save(); };
  $('siteOn').onchange = function () {
    var i = s.disabledSites.indexOf(host);
    if (this.checked && i >= 0) s.disabledSites.splice(i, 1);
    if (!this.checked && i < 0) s.disabledSites.push(host);
    save();
  };
  Array.prototype.forEach.call(document.querySelectorAll('#modes button'), function (b) {
    b.onclick = function () { s.mode = b.dataset.m; save(); };
  });
  $('opts').onclick = function () { chrome.runtime.openOptionsPage(); };
})();
