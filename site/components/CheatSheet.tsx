import React, { useMemo, useState } from 'react';
import { Engine } from '../engine';
import type { Entry, OutputMode } from '../types';

const CheatSheet: React.FC<{ mode: OutputMode }> = ({ mode }) => {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [copied, setCopied] = useState<string | null>(null);
  const all: Entry[] = useMemo(() => [...Engine.SYMBOLS, ...Engine.TEMPLATES], []);
  const cats = useMemo(() => ['All', ...Array.from(new Set(all.map((e) => e.category)))], [all]);
  const rows = all.filter((e) => {
    if (cat !== 'All' && e.category !== cat) return false;
    const s = q.trim().toLowerCase();
    return !s || `${e.trigger} ${e.name} ${e.unicode} ${e.latex} ${e.aliases.join(' ')}`.toLowerCase().includes(s);
  });

  const copy = async (e: Entry) => {
    await navigator.clipboard.writeText(Engine.renderEntry(e, mode));
    setCopied(e.trigger);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-900">Shortcut dictionary</h3>
          <p className="text-sm text-slate-500">{all.length} shortcuts. Type <code>\name</code> in any chat box, or click a row to copy.</p>
        </div>
        <input data-mathlogic-off value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: union, integral, ≤, alpha…"
          className="w-full md:w-72 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400" />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`text-xs px-3 py-1 rounded-full border ${cat === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{c}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[460px] overflow-y-auto pr-1">
        {rows.map((e) => (
          <button key={e.kind + e.trigger} onClick={() => copy(e)} className="flex items-center gap-3 p-2 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 text-left">
            {(() => {
              const g = Engine.glyphFor(e);
              return (
                <span data-glyph className={'shrink-0 min-w-[52px] h-10 px-1.5 rounded-lg bg-slate-50 flex items-center justify-center text-indigo-700 whitespace-nowrap ' +
                  (g.word ? 'font-sans font-semibold text-[13px] tracking-wide' : 'math-font text-lg overflow-hidden')}>{g.text}</span>
              );
            })()}
            <span className="min-w-0">
              <span className="block font-mono text-[13px] font-semibold text-slate-800">\{e.trigger}</span>
              <span className="block text-xs text-slate-500 truncate" title={Engine.hintFor(e) || e.name}>{copied === e.trigger ? 'Copied ✓' : e.name}</span>
              {Engine.hintFor(e) && <span className="block text-[11px] text-slate-400 leading-snug mt-0.5 line-clamp-2">{Engine.hintFor(e)}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CheatSheet;
