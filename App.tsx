import React, { useEffect, useState } from 'react';
import ChatDemo from './components/ChatDemo';
import Settings from './components/Settings';
import CheatSheet from './components/CheatSheet';
import Recipes from './components/Recipes';
import Inspector from './components/Inspector';
import { Engine } from './engine';
import type { Settings as S } from './types';

const STORE_KEY = 'mathlogic-demo-settings';
// the settings the demo remembers, listed once
const PERSISTED = ['mode', 'smartOps', 'bracketCheck', 'target'] as const;

function loadSettings(): S {
  const base: S = JSON.parse(JSON.stringify(Engine.DEFAULT_SETTINGS));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...base, ...Object.fromEntries(PERSISTED.filter((k) => saved[k] !== undefined).map((k) => [k, saved[k]])) };
  } catch {
    return base;
  }
}

const HOW = [
  { k: '\\forall', out: '∀', title: 'Backslash shortcuts', body: 'Type \\ plus a name. A popup suggests symbols; press Tab or Enter to insert, or Space after the full name.' },
  { k: 'x^2 -> y', out: 'x² → y', title: 'Smart operators', body: 'Common ASCII math turns into real symbols as you type: <=, !=, =>, ^2, a_n, +-.' },
  { k: '\\intab', out: '∫_(⬚)^(⬚) ⬚ d⬚', title: 'Templates with slots', body: 'Integrals, sums, limits, matrices, set-builder and more. Tab jumps to the next ⬚.' },
  { k: '/math …', out: 'x² ≥ 0', title: 'Plain English', body: 'Write “/math x squared is at least 0” and press Enter. Converts offline, with optional free AI for harder phrases.' },
];

const App: React.FC = () => {
  const [settings, setSettings] = useState<S>(loadSettings);
  const [extensionActive, setExtensionActive] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, settings[k]])))); } catch { /* private mode */ }
  }, [settings.mode, settings.smartOps, settings.bracketCheck, settings.target]);

  // The extension marks pages it runs on. If present, let it drive the demo.
  useEffect(() => {
    const check = () => setExtensionActive(document.documentElement.getAttribute('data-mathlogic-ext') === '1');
    check();
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 py-3 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-3">
            <img src="/icon128.png" alt="" className="w-9 h-9 rounded-xl shadow-md shadow-indigo-200" />
            <span className="text-lg font-black tracking-tight">Math Logic</span>
          </a>
          <nav className="flex items-center gap-5 text-sm font-semibold text-slate-500">
            <a href="#how" className="hidden sm:inline hover:text-indigo-600">How it works</a>
            <a href="#recipes" className="hidden sm:inline hover:text-indigo-600">Recipes</a>
            <a href="#inspect" className="hidden sm:inline hover:text-indigo-600">Inspector</a>
            <a href="#dictionary" className="hidden sm:inline hover:text-indigo-600">Dictionary</a>
            <a href="#install" className="px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-black flex items-center gap-2">
              <i className="fa-brands fa-chrome" /> {extensionActive ? 'Installed ✓' : 'Add to Chrome'}
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="max-w-3xl mx-auto px-4 text-center pt-14 pb-10">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
            Type math into ChatGPT<br className="hidden sm:block" /> the way you type words.
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">
            Math Logic works like Grammarly, but for math and logic notation. It runs inside ChatGPT, Claude, Gemini and any other text box. Type{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-200 text-sm">\forall</code>, <code className="px-1.5 py-0.5 rounded bg-slate-200 text-sm">x^2</code> or plain English and get{' '}
            <span className="math-font text-indigo-700 text-xl">∀ x²</span> right where you’re typing. No equation editor, no copy-paste.
          </p>
        </section>

        <ChatDemo settings={settings} extensionActive={extensionActive} />
        {!extensionActive && <Settings settings={settings} onChange={setSettings} />}

        <section id="how" className="max-w-5xl mx-auto px-4 mt-20">
          <h2 className="text-2xl font-black text-center mb-8">Four ways to write math without leaving the chat</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW.map((h) => (
              <div key={h.title} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 text-sm">
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{h.k}</code>
                  <i className="fa-solid fa-arrow-right text-slate-300 text-xs" />
                  <span className="math-font text-indigo-700 text-lg">{h.out}</span>
                </div>
                <h3 className="mt-3 font-bold text-slate-900">{h.title}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Anything already selected? Press <kbd>Alt</kbd>/<kbd>⌥</kbd> + <kbd>M</kbd> to convert it in place. Your own shortcuts (<code>bayes = P(A|B) = …</code>) can be added in the extension settings.
          </p>
        </section>

        <section id="recipes" className="max-w-5xl mx-auto px-4 mt-20">
          <Recipes />
        </section>

        <section id="inspect" className="max-w-5xl mx-auto px-4 mt-20">
          <Inspector target={settings.target} />
        </section>

        <section id="dictionary" className="max-w-5xl mx-auto px-4 mt-20">
          <CheatSheet mode={settings.mode} />
        </section>

        <section id="install" className="max-w-5xl mx-auto px-4 mt-20">
          <div className="rounded-3xl bg-slate-900 text-white p-8 md:p-10 grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-black">Install the Chrome extension</h2>
              <p className="mt-2 text-slate-300 text-sm leading-relaxed">
                Works in Chrome, Edge, Brave and Arc. It isn’t on the Chrome Web Store yet, so for now you load it yourself. It takes about 30 seconds.
              </p>
              <a href="/mathlogic-extension.zip" download className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-900 font-bold hover:bg-indigo-50">
                <i className="fa-solid fa-download" /> Download extension (.zip)
              </a>
            </div>
            <ol className="space-y-3 text-sm text-slate-200 list-decimal list-inside">
              <li>Unzip the download. You get a folder with <code className="text-indigo-200">manifest.json</code> inside.</li>
              <li>Open <code className="text-indigo-200">chrome://extensions</code> and switch on <b>Developer mode</b> (top right).</li>
              <li>Click <b>Load unpacked</b> and choose that folder.</li>
              <li>Pin the <span className="math-font">∑</span> icon, then open ChatGPT and type <code className="text-indigo-200">\forall</code>.</li>
              <li><i>Optional:</i> in Settings, paste a free <a className="underline" href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq API key</a> so <code className="text-indigo-200">/math</code> understands any phrasing.</li>
            </ol>
          </div>
        </section>
      </main>

      <footer className="mt-20 text-center text-xs text-slate-400">
        Math Logic · Your text stays in your browser. AI conversion is optional and uses your own key. · <a href="/privacy.html" className="underline hover:text-indigo-600">Privacy policy</a>
      </footer>
    </div>
  );
};

export default App;
