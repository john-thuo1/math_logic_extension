import React, { useEffect, useRef, useState } from 'react';
import { Controller } from '../engine';
import type { Settings } from '../types';

interface Props {
  settings: Settings;
  extensionActive: boolean;
}

const EXAMPLES = [
  { label: '/math sum of 1/n^2 from n=1 to infinity', text: 'What does /math sum of 1/n^2 from n=1 to infinity' },
  { label: '/math limit of sin(x)/x as x approaches 0', text: 'Explain why /math limit of sin(x)/x as x approaches 0' },
  { label: '/math if p implies q and q implies r then p implies r', text: 'Prove: /math if p implies q and q implies r then p implies r' },
];

const ChatDemo: React.FC<Props> = ({ settings, extensionActive }) => {
  const composer = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [messages, setMessages] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Attach the exact same controller the extension uses, unless the real
  // extension is already running on this page (then it does the work).
  useEffect(() => {
    if (extensionActive || !composer.current) return;
    const c = new Controller({ getSettings: () => settingsRef.current, scope: composer.current }).start();
    return () => c.stop();
  }, [extensionActive]);

  const text = () => (composer.current?.innerText || '').replace(/ /g, ' ').trim();

  const send = () => {
    const t = text();
    if (!t) return;
    setMessages((m) => [...m, t]);
    if (composer.current) composer.current.innerHTML = '';
  };

  const loadExample = (t: string) => {
    const el = composer.current;
    if (!el || !t) { el?.focus(); return; }
    el.focus();
    el.innerText = t;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  const openIn = (where: 'chatgpt' | 'claude') => {
    const q = encodeURIComponent(text() || messages[messages.length - 1] || '');
    window.open(where === 'chatgpt' ? `https://chatgpt.com/?q=${q}` : `https://claude.ai/new?q=${q}`, '_blank', 'noopener');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text() || messages[messages.length - 1] || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-300" /><span className="w-2.5 h-2.5 rounded-full bg-amber-300" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
            <span className="ml-2 font-semibold">A chat box like ChatGPT’s (try it here)</span>
          </div>
          <span className={`px-2 py-0.5 rounded-full font-bold ${extensionActive ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'}`}>
            {extensionActive ? 'Extension active' : 'Live demo'} · {settings.mode}
          </span>
        </div>

        <div className="min-h-[120px] max-h-72 overflow-y-auto px-5 py-4 space-y-3 bg-white">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">Messages you “send” show up here, exactly as an AI would receive them.</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-slate-100 rounded-2xl rounded-br-md px-4 py-2 text-[15px] math-font whitespace-pre-wrap">{m}</div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-slate-100">
          <div className="rounded-2xl border border-slate-300 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50 transition bg-white">
            <div
              ref={composer}
              contentEditable
              suppressContentEditableWarning
              className="composer px-4 py-3 min-h-[56px] max-h-48 overflow-y-auto text-[16px] outline-none"
              data-placeholder="Message… try  \forall x \in \RR, x^2 >= 0  or  /math integral from 0 to 1 of x^2 dx  then Enter"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) { e.preventDefault(); send(); } }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex gap-1.5 text-xs">
                <button onClick={() => openIn('chatgpt')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Open in ChatGPT</button>
                <button onClick={() => openIn('claude')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Open in Claude</button>
                <button onClick={copy} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1`} />{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button onClick={send} aria-label="Send" className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-black">
                <i className="fa-solid fa-arrow-up text-sm" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} onClick={() => loadExample(ex.text)} className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 text-slate-600 font-mono">
            {ex.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">Click an example, put your cursor at the end, and press <kbd>Enter</kbd> to convert. Press <kbd>Enter</kbd> again to send.</p>
    </div>
  );
};

export default ChatDemo;
