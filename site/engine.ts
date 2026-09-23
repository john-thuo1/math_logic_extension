// Typed bridge to the shared plain-JS engine used by the Chrome extension.
import '../extension/engine.js';
import '../extension/content.js';
import type { Entry, Settings, OutputMode, Recipe } from './types';

interface EngineApi {
  PH: string;
  SYMBOLS: Entry[];
  TEMPLATES: Entry[];
  DEFAULT_SETTINGS: Settings;
  renderEntry(e: Entry, mode: OutputMode, target?: string): string;
  convertOffline(phrase: string, mode: OutputMode, opts?: { wrapLatex?: boolean }): { text: string; latex: string; confident: boolean; leftover: string[] };
  hintFor(e: Entry): string;
  TARGETS: Record<string, { label: string; help: string }>;
  MODE_INFO: { id: string; label: string; sample: string; short: string; desc: string; hint: string; ai: string }[];
  modeInfo(id: string): { id: string; label: string; sample: string; short: string; desc: string; hint: string; ai: string };
  glyphFor(e: Entry): { text: string; word: boolean };
  recipeKey(k: string): { press?: string; type?: string };
  searchText(e: Entry): string;
  NOT_A_FORMULA: string;
  checkFormula(text: string, opts?: { target?: string }): { type: string; level: 'error' | 'target' | 'semantic' | 'style' | 'info'; ch: string; at: number; count: number; message: string } | null;
  looksLikeFormula(text: string): boolean;
  formulaTree(text: string): string | null;
  describeTop(text: string): string | null;
  RECIPES: Recipe[];
}
interface ControllerApi { start(): ControllerApi; stop(): void }
type ControllerCtor = new (opts: { getSettings: () => Settings; scope?: HTMLElement; ai?: unknown }) => ControllerApi;

const g = globalThis as unknown as { MathLogicEngine: EngineApi; MathLogicController: ControllerCtor };
export const Engine = g.MathLogicEngine;
export const Controller = g.MathLogicController;
