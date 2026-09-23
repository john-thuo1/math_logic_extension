import React from 'react';
import { Engine } from '../engine';
import type { OutputMode, Settings as S } from '../types';

interface Props {
  settings: S;
  onChange: (s: S) => void;
}

const MODES = Engine.MODE_INFO; // the engine's table, not a second copy

const Settings: React.FC<Props> = ({ settings, onChange }) => (
  <div className="max-w-3xl mx-auto px-4 mt-10">
    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Output format</h3>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange({ ...settings, mode: m.id as OutputMode })}
          className={`p-3 rounded-xl border-2 text-left transition ${settings.mode === m.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
        >
          <div className="font-bold text-slate-900">{m.label}</div>
          <div className="math-font text-indigo-700 text-sm truncate">{m.sample}</div>
          <div className="text-[11px] text-slate-500 mt-1 leading-snug">{m.desc}</div>
        </button>
      ))}
    </div>
    <label className="mt-4 flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
      <input type="checkbox" className="mt-1 accent-indigo-600" checked={settings.smartOps} onChange={(e) => onChange({ ...settings, smartOps: e.target.checked })} />
      <span><b className="text-slate-800">Smart operators</b>: <code>-&gt;</code> →, <code>=&gt;</code> ⇒, <code>&lt;=</code> ≤, <code>!=</code> ≠, <code>+-</code> ±, <code>x^2</code> x², <code>a_n</code> aₙ as you type (Unicode and Auto modes).</span>
    </label>
    <label className="mt-4 block text-sm text-slate-600">
      <span className="block font-semibold text-slate-800 mb-1">Target syntax for ASCII output</span>
      <select
        data-mathlogic-off
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        value={settings.target || 'generic'}
        onChange={(e) => onChange({ ...settings, target: e.target.value })}
      >
        {Object.entries(Engine.TARGETS).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
      </select>
      <span className="mt-1 block text-xs text-slate-500">
        Write <code>\Xs</code> for strong next and <code>\Xw</code> for weak next; plain <code>\X</code> stays Next. {Engine.TARGETS[settings.target || 'generic']?.help} Unicode and LaTeX display never change.
      </span>
    </label>
    <label className="mt-2 flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
      <input type="checkbox" className="mt-1 accent-indigo-600" checked={settings.bracketCheck !== false} onChange={(e) => onChange({ ...settings, bracketCheck: e.target.checked })} />
      <span><b className="text-slate-800">Formula check</b>: when a line looks like a formula, a note points out the worst problem first. What will not parse, such as unclosed brackets or an operator with nothing on one side. What the target above will not accept. What parses but may mean something else, such as a bare <code>X</code> on a finite trace. Style slips such as mixing <code>⇒</code> with <code>→</code>. It only warns and never changes what you typed.</span>
    </label>
  </div>
);

export default Settings;
