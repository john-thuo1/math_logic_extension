import React, { useState } from 'react';
import { Engine } from '../engine';

const SAMPLES: { label: string; text: string }[] = [
  { label: 'checkpoint beside the rule', text: 'G(start -> (X(processing) & F(done))) & F(checkpoint)' },
  { label: 'checkpoint inside the rule', text: 'G(start -> (X(processing) & F(done) & F(checkpoint)))' },
  { label: 'a bracket left open', text: 'G((request & !error) -> F(grant & X(done))' },
];

// The same parser the extension uses: tokens → AST → tree.
const Inspector: React.FC<{ target?: string }> = ({ target }) => {
  const [text, setText] = useState(SAMPLES[0].text);
  const trimmed = text.trim();
  const tree = trimmed ? Engine.formulaTree(trimmed) : null;
  const top = trimmed ? Engine.describeTop(trimmed) : null;
  const issue = trimmed ? Engine.checkFormula(trimmed, { target }) : null;

  return (
    <div id="inspector">
      <h2 className="text-2xl font-black text-center mb-2">See what sits inside what</h2>
      <p className="text-center text-sm text-slate-500 mb-8 max-w-2xl mx-auto">
        A requirement that ends up inside <code>G(start ⇒ …)</code> instead of beside it says something quite different. The text looks almost the same. The tree does not.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="min-w-0">
          <textarea
            data-mathlogic-off
            spellCheck={false}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => setText(s.text)}
                className="text-xs px-3 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-3 text-sm">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tree ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {top || Engine.NOT_A_FORMULA}
            </span>
            {issue && (
              <span className="ml-2 text-xs text-amber-700">{issue.level.toUpperCase()} · {issue.message}</span>
            )}
          </div>
        </div>
        <pre className="min-w-0 overflow-x-auto rounded-2xl bg-slate-900 text-slate-100 p-4 text-[13px] leading-relaxed">
          {tree || '—'}
        </pre>
      </div>
    </div>
  );
};

export default Inspector;
