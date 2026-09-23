import React from 'react';
import { Engine } from '../engine';

// The same recipes as the extension's Settings page, each replayed by the E2E tests.
const Key: React.FC<{ k: string }> = ({ k }) => {
  const r = Engine.recipeKey(k); // the engine owns the {Tab} notation
  return r.press ? <kbd>{r.press}</kbd> : <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-xs whitespace-pre-wrap break-words">{r.type}</code>;
};

const Recipes: React.FC = () => (
  <div>
    <h2 className="text-2xl font-black text-center mb-2">Step-by-step recipes</h2>
    <p className="text-center text-sm text-slate-500 mb-8">Type exactly this in the demo above or in any chat box. Every recipe is checked by automated tests.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Engine.RECIPES.map((r) => (
        <div key={r.id} data-recipe={r.id} className="min-w-0 bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 mb-3">{r.title}</h3>
          <div className="flex flex-wrap gap-1 items-center">{r.keys.map((k, i) => <Key key={i} k={k} />)}</div>
          <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 math-font text-indigo-900 whitespace-pre-wrap break-words overflow-x-auto">{r.result}</div>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">{r.tip}</p>
        </div>
      ))}
    </div>
  </div>
);

export default Recipes;
