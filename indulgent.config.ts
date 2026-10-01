// ============================================================================
//  INDULGENT: THE ONE CONFIG FILE
//
//  Almost everything you might want to tweak lives here:
//    * app        ports, where files are saved, which Claude settings to load
//    * labels     the names shown in the UI (rename "The Booth" to anything!)
//    * colorCode  READ / SEARCHED / EDITED / CREATED / DELETED / RAN colors
//    * toolKinds  which Claude tool belongs to which color-code category
//    * themes     the mood presets (colors, fonts, effects)
//    * layouts    where each panel sits on the screen
//    * features   switch whole panels / features on or off
//    * limits     caps that keep big projects fast
//    * scan       which folders to skip when reading your project
//    * languages  which languages the code analyzer understands
//
//  You can also change most of this live inside the app (the settings drawer).
//  Whatever you change in the app is saved to ./data/settings.json and wins over
//  the defaults in this file. Delete that file to go back to these defaults.
// ============================================================================
import type { Kind } from './shared/events.ts';
import type { ColorCode, FontChoice, NamedLayout, Theme } from './shared/types.ts';

// ---- app --------------------------------------------------------------------
const app = {
  name: 'INDULGENT',
  tagline: 'sweet on the surface. something slightly wrong underneath.',
  /** The Node backend listens here (only on your own computer, never the network). */
  serverPort: 4317,
  /** The Vite dev server (the page you open in the browser). */
  webPort: 5173,
  /** Where sessions and settings are saved as plain JSON files. */
  dataDir: './data',
  /**
   * "auto"      = use real Claude if credentials are found, otherwise rehearsal
   * "live"      = always real Claude
   * "rehearsal" = always the scripted fake session (free, no key needed)
   */
  defaultMode: 'auto' as 'auto' | 'live' | 'rehearsal',
  /**
   * Which Claude Code settings files to load, same as running `claude` in a terminal.
   * 'user' = ~/.claude/settings.json, 'project' = <project>/.claude/settings.json (+ CLAUDE.md),
   * 'local' = <project>/.claude/settings.local.json
   */
  settingSources: ['user', 'project', 'local'] as Array<'user' | 'project' | 'local'>,
};

// ---- labels (rename anything) ----------------------------------------------
const labels = {
  booth: 'The Booth',
  setlist: 'Setlist',
  menu: 'The Menu',
  map: 'Cut Diagram',
  graph: 'Pairings',
  code: 'The Pass',
  diff: 'The Remix',
  impact: 'Ripples',
  tests: 'Taste Test',
  trails: 'Burn Marks',
  git: 'Recipe Book',
  replay: 'Playback',
  sketch: 'Floor Plan',
  explain: 'Liner Notes',
  pianoroll: 'Piano Roll',
  pitch: 'Pitch Curve',
  heartbeat: 'Pulse',
  donut: 'The Pie',
  stats: 'The Receipt',
  dishes: 'Trophy Case',
  fullness: 'Fullness',
  tab: 'The Tab',
  stars: 'Stars',
  permission: 'May I?',
  producer: 'Producer',
  voice: 'The Voice',
  newSession: 'New Take',
  project: 'Kitchen',
};

// ---- the color code ---------------------------------------------------------
// One consistent meaning for each color, used everywhere (map, graph, cards...).
const colorCode: ColorCode = {
  read: '#4da3ff', // blue
  search: '#b57bff', // purple
  edit: '#ff3fa4', // hot pink
  create: '#43e08b', // green
  delete: '#ff4d4d', // red
  run: '#ffd23f', // yellow
  other: '#8f8aa3', // grey (things that don't touch your code)
};

/** The words shown next to each color in legends. */
const kindLabels: Record<Kind, string> = {
  read: 'READ',
  search: 'SEARCHED',
  edit: 'EDITED',
  create: 'CREATED',
  delete: 'DELETED',
  run: 'RAN',
  other: 'OTHER',
};

// ---- which Claude tool is which kind ---------------------------------------
// (Write counts as CREATED when the file is new, EDITED when it already exists.
//  Bash counts as DELETED when it runs `rm`, otherwise RAN.)
const toolKinds: Record<string, Kind> = {
  Read: 'read',
  NotebookRead: 'read',
  LS: 'read',
  Grep: 'search',
  Glob: 'search',
  WebSearch: 'search',
  WebFetch: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'create',
  Bash: 'run',
  BashOutput: 'run',
  KillShell: 'run',
};

// ---- fonts you can pick in the theme editor --------------------------------
// (The first four are bundled with the app, so they work offline.)
const fontChoices: FontChoice[] = [
  { label: 'Fraunces (fancy soft serif)', stack: '"Fraunces Variable", Georgia, serif' },
  { label: 'Playfair Display (menu serif)', stack: '"Playfair Display Variable", Georgia, serif' },
  { label: 'Nunito (soft rounded sans)', stack: '"Nunito Variable", ui-rounded, system-ui, sans-serif' },
  { label: 'JetBrains Mono', stack: '"JetBrains Mono Variable", ui-monospace, Menlo, monospace' },
  { label: 'VT323 (terminal)', stack: '"VT323", ui-monospace, monospace' },
  { label: 'System UI', stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { label: 'System serif', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'System mono', stack: 'ui-monospace, Menlo, Consolas, monospace' },
];

const FRAUNCES = fontChoices[0].stack;
const PLAYFAIR = fontChoices[1].stack;
const NUNITO = fontChoices[2].stack;
const JETBRAINS = fontChoices[3].stack;
const VT323 = fontChoices[4].stack;

// Slightly deeper versions of the color code that stay readable on light backgrounds.
const lightColorCode: Partial<ColorCode> = {
  read: '#2468c9',
  search: '#7a45c8',
  edit: '#d41f86',
  create: '#1f9a50',
  delete: '#c4232c',
  run: '#b58900',
  other: '#6f6a80',
};

// ---- mood presets ------------------------------------------------------------
const themes: Record<string, Theme> = {
  'spoken-for': {
    label: 'Spoken For',
    blurb: 'Glossy hot-pink idol-pop on a dark stage.',
    dark: true,
    colors: {
      bg: '#0c0610',
      bgAlt: '#140a1a',
      surface: '#1c0f26',
      surfaceHi: '#2b1740',
      border: '#4b2862',
      text: '#fdeef8',
      textDim: '#bb98b4',
      accent: '#ff2e97',
      accent2: '#ffa8dc',
      onAccent: '#1a0412',
      good: '#4cf0a0',
      bad: '#ff4a5c',
      warn: '#ffd54a',
    },
    fonts: { display: FRAUNCES, body: NUNITO, mono: JETBRAINS },
    fontSize: 15,
    radius: 14,
    animSpeed: 1,
    effects: { scanlines: 0.12, noise: 0.12, glow: 0.6, glitch: 0.25, gloss: 0.8 },
  },
  static: {
    label: 'Static',
    blurb: 'Glitchy analog-horror CRT. Please do not adjust your set.',
    dark: true,
    colors: {
      bg: '#050706',
      bgAlt: '#0a0e0c',
      surface: '#0f1512',
      surfaceHi: '#16201b',
      border: '#2e4237',
      text: '#cfe3d6',
      textDim: '#7b9585',
      accent: '#8cffd0',
      accent2: '#ff5a7a',
      onAccent: '#02100a',
      good: '#7dffb0',
      bad: '#ff4b4b',
      warn: '#ffe066',
    },
    fonts: { display: VT323, body: JETBRAINS, mono: JETBRAINS },
    fontSize: 14,
    radius: 2,
    animSpeed: 1,
    effects: { scanlines: 0.7, noise: 0.55, glow: 0.5, glitch: 0.7, gloss: 0 },
  },
  human: {
    label: 'Human',
    blurb: 'Warm cream and gold. Almost too normal.',
    dark: false,
    colors: {
      bg: '#f5ebd7',
      bgAlt: '#efe2c8',
      surface: '#fff9ec',
      surfaceHi: '#ffffff',
      border: '#d9c49a',
      text: '#3b2a17',
      textDim: '#8a7456',
      accent: '#c58a1c',
      accent2: '#8c3b2e',
      onAccent: '#fffaf0',
      good: '#2f8f5b',
      bad: '#b3392f',
      warn: '#b8860b',
    },
    fonts: { display: FRAUNCES, body: NUNITO, mono: JETBRAINS },
    fontSize: 15,
    radius: 16,
    animSpeed: 0.9,
    effects: { scanlines: 0, noise: 0.05, glow: 0.15, glitch: 0, gloss: 0.4 },
    colorCode: lightColorCode,
  },
  'butcher-counter': {
    label: 'Butcher Counter',
    blurb: 'White tile, hard red, brushed steel.',
    dark: false,
    colors: {
      bg: '#e9ecee',
      bgAlt: '#dfe3e6',
      surface: '#ffffff',
      surfaceHi: '#f6f8f9',
      border: '#aeb7be',
      text: '#1b2227',
      textDim: '#5d6a73',
      accent: '#c8102e',
      accent2: '#52616b',
      onAccent: '#ffffff',
      good: '#1f8a4c',
      bad: '#c8102e',
      warn: '#b07d00',
    },
    fonts: { display: PLAYFAIR, body: NUNITO, mono: JETBRAINS },
    fontSize: 15,
    radius: 4,
    animSpeed: 1,
    effects: { scanlines: 0, noise: 0, glow: 0, glitch: 0, gloss: 0.35 },
    colorCode: lightColorCode,
  },
  cardiac: {
    label: 'Cardiac',
    blurb: 'Black room. One green line. Do not look away.',
    dark: true,
    colors: {
      bg: '#000000',
      bgAlt: '#030806',
      surface: '#05110b',
      surfaceHi: '#0a1f14',
      border: '#0f4a2a',
      text: '#c9ffe0',
      textDim: '#5fa383',
      accent: '#2cff7c',
      accent2: '#ff3b46',
      onAccent: '#00140a',
      good: '#2cff7c',
      bad: '#ff3b46',
      warn: '#ffe14a',
    },
    fonts: { display: JETBRAINS, body: JETBRAINS, mono: JETBRAINS },
    fontSize: 14,
    radius: 6,
    animSpeed: 1,
    effects: { scanlines: 0.25, noise: 0.1, glow: 1, glitch: 0.15, gloss: 0.1 },
  },
};

const defaultTheme = 'spoken-for';

// ---- layouts ----------------------------------------------------------------
// The screen is a 24 x 24 grid that always stretches to fill the window, so
// layouts keep working when you resize. Each item: x, y = top-left corner;
// w, h = width and height in grid cells. `i` is the panel id.
const grid = { cols: 24, rows: 24, margin: 10 };

const layouts: Record<string, NamedLayout> = {
  focus: {
    label: 'Focus',
    items: [{ i: 'booth', x: 0, y: 0, w: 24, h: 24 }],
  },
};

const defaultLayout = 'focus';

// ---- features (turn things off here, or in the settings drawer) ------------
const features: Record<string, boolean> = {
  booth: true,
};

// ---- performance caps -------------------------------------------------------
const limits = {
  /** Chat messages rendered at once (older ones sit behind "show earlier"). */
  chatWindow: 120,
  /** The browser redraws live visuals at most this often (milliseconds). */
  uiThrottleMs: 80,
  /** Largest chunk of tool output kept in memory/logs (characters). */
  maxToolOutputChars: 12000,
  /** Largest single string kept inside a tool's input (characters). */
  maxInputStringChars: 20000,
};

// ---- which files the project scanner skips ----------------------------------
const scan = {
  ignoreDirs: [
    'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next', '.nuxt',
    '.cache', '.turbo', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache',
    'target', 'vendor', 'coverage', '.idea', '.vscode',
  ],
  maxFiles: 20000,
  maxFileBytes: 1_000_000,
};

// ---- languages the code analyzer understands -------------------------------
// Each name must match a file in server/analysis/languages/ (added in the map stage).
const languages = ['typescript', 'python'];

export const config = {
  app,
  labels,
  colorCode,
  kindLabels,
  toolKinds,
  fontChoices,
  themes,
  defaultTheme,
  grid,
  layouts,
  defaultLayout,
  features,
  limits,
  scan,
  languages,
};

export type IndulgentConfig = typeof config;
export default config;
