// Shapes used by indulgent.config.ts and the theme system.
import type { Kind } from './events.ts';

/** Every effect is a number from 0 (off) to 1 (full). */
export interface ThemeEffects {
  scanlines: number;
  noise: number;
  glow: number;
  glitch: number;
  /** Glossy highlight on panels and buttons. */
  gloss: number;
}

export interface ThemeColors {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceHi: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  /** Text color used on top of the accent color (buttons). */
  onAccent: string;
  good: string;
  bad: string;
  warn: string;
}

export interface Theme {
  label: string;
  blurb: string;
  /** true = dark theme (affects scrollbars and form controls). */
  dark: boolean;
  colors: ThemeColors;
  /**
   * display = the wordmark and big headlines
   * body    = running text you read (Claude's replies, explanations)
   * ui      = the interface itself: buttons, tabs, labels, numbers (falls back to `body`)
   * mono    = code
   */
  fonts: { display: string; body: string; mono: string; ui?: string };
  /** Base font size in px. The whole UI scales from this. */
  fontSize: number;
  /** Corner roundness in px. */
  radius: number;
  /** Animation speed multiplier (1 = normal, 2 = twice as fast, 0.5 = slow). */
  animSpeed: number;
  effects: ThemeEffects;
  /** Optional per-theme tweaks to the READ/EDITED/... colors. */
  colorCode?: Partial<Record<Kind, string>>;
}

export type ColorCode = Record<Kind, string>;

export interface FontChoice {
  label: string;
  stack: string;
}

/** One panel's position on the 24 x 24 layout grid. */
export interface LayoutItem {
  /** Which panel this cell shows. For a tab group it is just a unique name for the cell (e.g. "view"). */
  i: string;
  /** Set this to make the cell a TAB GROUP: it shows these panels as tabs, one at a time. */
  tabs?: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NamedLayout {
  label: string;
  items: LayoutItem[];
}

export type PanelId = string;
