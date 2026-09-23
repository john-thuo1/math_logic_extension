export type OutputMode = 'UNICODE' | 'LATEX' | 'ASCII' | 'AUTO';

export interface Entry {
  kind: 'symbol' | 'template';
  trigger: string;
  name: string;
  unicode: string;
  latex: string;
  ascii: string;
  category: string;
  aliases: string[];
  glyph?: string;
}

export interface Recipe {
  id: string;
  title: string;
  keys: string[];
  result: string;
  tip: string;
}

export interface Settings {
  version?: number;
  enabled: boolean;
  mode: OutputMode;
  smartOps: boolean;
  bracketCheck: boolean;
  target: string;
  wrapLatex: boolean;
  disabledSites: string[];
  customSnippets: string;
  ai: { provider: string; apiKey: string; model: string; baseUrl: string; preferAI: boolean; consent: boolean };
}
