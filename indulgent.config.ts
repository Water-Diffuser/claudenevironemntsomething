// ============================================================================
//  INDULGENT: THE ONE CONFIG FILE
//
//  Almost everything you might want to tweak lives here:
//    * app        ports, where files are saved, which Claude settings to load
//    * models     the model / effort / thinking pickers (and a fallback model list)
//    * commands   example "/" commands shown when Claude can't be asked for its own
//    * labels     the names shown in the UI (rename "The Booth" to anything!)
//    * colorCode  READ / SEARCHED / EDITED / CREATED / DELETED / RAN colors
//    * toolKinds  which Claude tool belongs to which color-code category
//    * themes     the mood presets (colors, fonts, effects)
//    * layouts    where each panel sits on the screen (and which ones share a tab group)
//    * dock       the strip along the bottom that holds Terminal, Tests, Git...
//    * features   switch whole panels / features on or off
//    * limits     caps that keep big projects fast
//    * hud        the numbers behind the meters and stars
//    * audio      the generated music, tool-call notes and volumes
//    * scan       which folders to skip when reading your project
//    * languages  which languages the code analyzer understands
//
//  You can also change most of this live inside the app (the settings drawer).
//  Whatever you change in the app is saved to ./data/settings.json and wins over
//  the defaults in this file. Delete that file to go back to these defaults.
// ============================================================================
import type { Kind } from './shared/events.ts';
import type { CommandChoice, EffortLevel, ModelChoice, ThinkingChoice } from './shared/models.ts';
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
  /**
   * Which Claude model answers "Explain this" and "Sketch the architecture".
   * Leave undefined to use your default model. Set e.g. 'haiku' for faster, cheaper answers.
   */
  sideModel: undefined as string | undefined,
};

// ---- models, effort and thinking ----------------------------------------------
// The pickers next to the message box. In Live mode the app asks Claude which models your
// account can use (and which effort levels each accepts) and shows that real list.
// In Rehearsal mode, or if Claude can't be asked, this `fallback` list is shown instead.
// (The effort lists below are placeholders: Claude's own list always wins when it is available.)
const models = {
  fallback: [
    { value: 'default', label: 'Default', description: 'Whatever your Claude Code is set to use', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], adaptiveThinking: true },
    { value: 'opus', label: 'Opus', description: 'The most capable model, for hard problems', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], adaptiveThinking: true },
    { value: 'sonnet', label: 'Sonnet', description: 'Fast and capable, a good everyday choice', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], adaptiveThinking: true },
    { value: 'haiku', label: 'Haiku', description: 'The quickest and cheapest', efforts: [], adaptiveThinking: false },
  ] as ModelChoice[],
  /** Which model a brand-new install starts on. null = "Default" (your Claude Code's own choice). */
  defaultModel: null as string | null,
  /** Starting effort. null = "Auto" (the model's own default). */
  defaultEffort: null as EffortLevel | null,
  /** "auto" lets Claude decide when to think. "off" turns extended thinking off. */
  defaultThinking: 'auto' as ThinkingChoice,
  /** How many models are listed up front in the picker. The rest sit under "More versions". */
  primaryCount: 5,
  /** The words shown for each effort level. */
  effortLabels: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' } as Record<EffortLevel, string>,
};

// ---- slash commands ----------------------------------------------------------
// Type "/" in the message box. A few commands are handled by this app itself (/new, /model...).
// In Live mode the rest of the list is Claude Code's own commands and skills, fetched from Claude.
// In Rehearsal mode (or if Claude can't be asked) these examples are shown instead.
const commands = {
  fallback: [
    { name: 'compact', description: 'Summarize the conversation so far to free up context' },
    { name: 'review', description: 'Review the changes on this branch' },
    { name: 'init', description: 'Create a CLAUDE.md that explains this project' },
  ] as CommandChoice[],
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
  terminal: 'Terminal',
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
  startSession: 'Start Session',
  sound: 'Sound',
  settings: 'Mixing Desk',
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
    blurb: 'Night service. Quiet dark surfaces, one hot-pink signal light.',
    dark: true,
    colors: {
      // Neutral near-blacks with the faintest plum tint. Pink is kept for the accent only.
      bg: '#09080b',
      bgAlt: '#0d0b10',
      surface: '#121015',
      surfaceHi: '#1a171e',
      border: '#26222b',
      text: '#ece8ef',
      textDim: '#8d8697',
      accent: '#ff2e97',
      accent2: '#ff8ec4',
      onAccent: '#19030f',
      good: '#4fd9a0',
      bad: '#ff5d6c',
      warn: '#f0c04e',
    },
    // Two families, four jobs: a soft serif for the voice (wordmark, headlines, Claude's replies)
    // and a monospace for everything you operate (interface, numbers, code).
    fonts: { display: FRAUNCES, body: FRAUNCES, ui: JETBRAINS, mono: JETBRAINS },
    fontSize: 13,
    radius: 8,
    animSpeed: 1,
    // Restrained: the CRT effects are off by default (turn them up in the settings drawer).
    effects: { scanlines: 0, noise: 0, glow: 0.3, glitch: 0, gloss: 0.15 },
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
    fontSize: 13,
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
    fontSize: 14,
    radius: 10,
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
    fontSize: 14,
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
    fontSize: 13,
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
//
// An item with `tabs` is a TAB GROUP: one cell that shows several panels as
// tabs, one at a time. That is how a layout stays calm: the extra views are one
// click away instead of all on screen at once. (`i` is then just a name for the cell.)
//
// margin 0 = the panels meet edge to edge, separated by thin lines.
const grid = {
  cols: 24,
  rows: 24,
  margin: 0,
  /**
   * On windows narrower than this many pixels the tiles would be too small to use, so the layout
   * "stacks": all of its panels become tabs of ONE full-size panel instead.
   */
  stackBelow: 1000,
};

const layouts: Record<string, NamedLayout> = {
  // The everyday layout: talk, edit, and one view of the project (map, graph or ripples).
  workbench: {
    label: 'Workbench',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'code', x: 7, y: 0, w: 10, h: 24 },
      { i: 'view', tabs: ['map', 'graph', 'impact', 'explain', 'sketch'], x: 17, y: 0, w: 7, h: 24 },
    ],
  },
  // Check what Claude changed: the diff front and centre, the file beside it.
  review: {
    label: 'Review',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'diff', x: 7, y: 0, w: 10, h: 24 },
      { i: 'code', x: 17, y: 0, w: 7, h: 24 },
    ],
  },
  'map-room': {
    label: 'Map Room',
    items: [
      { i: 'booth', x: 0, y: 0, w: 6, h: 24 },
      { i: 'map', x: 6, y: 0, w: 9, h: 24 },
      { i: 'graph', x: 15, y: 0, w: 9, h: 24 },
    ],
  },
  inspector: {
    label: 'Inspector',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'graph', x: 7, y: 0, w: 9, h: 24 },
      { i: 'side', tabs: ['impact', 'explain', 'sketch'], x: 16, y: 0, w: 8, h: 24 },
    ],
  },
  'test-kitchen': {
    label: 'Test Kitchen',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'checks', tabs: ['tests', 'trails'], x: 7, y: 0, w: 9, h: 24 },
      { i: 'repo', tabs: ['git', 'map'], x: 16, y: 0, w: 8, h: 24 },
    ],
  },
  studio: {
    label: 'Studio',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'pianoroll', x: 7, y: 0, w: 17, h: 12 },
      { i: 'signals', tabs: ['pitch', 'heartbeat', 'donut'], x: 7, y: 12, w: 17, h: 12 },
    ],
  },
  'green-room': {
    label: 'Green Room',
    items: [
      { i: 'booth', x: 0, y: 0, w: 7, h: 24 },
      { i: 'courses', tabs: ['menu', 'dishes'], x: 7, y: 0, w: 9, h: 24 },
      { i: 'numbers', tabs: ['stats', 'donut', 'pitch', 'heartbeat'], x: 16, y: 0, w: 8, h: 24 },
    ],
  },
  focus: {
    label: 'Focus',
    items: [{ i: 'booth', x: 0, y: 0, w: 24, h: 24 }],
  },
};

const defaultLayout = 'workbench';

// ---- the dock ---------------------------------------------------------------
// A strip along the bottom that holds the "workshop" panels as tabs. It starts folded
// to just its tab bar, so it never competes with the work. Any panel can be opened there
// from the "+" menu in the dock's tab bar.
const dock = {
  /** Panels in the dock, in tab order. (A panel that the current layout already shows is skipped.) */
  panels: ['terminal', 'menu', 'tests', 'trails', 'git', 'replay'],
  /** Start folded (true = open). */
  startOpen: false,
  /** Open height in pixels (drag the dock's top edge to change it; your choice is saved). */
  height: 260,
  minHeight: 140,
  /** The dock never grows taller than this fraction of the window. */
  maxFraction: 0.6,
};

// ---- features (turn things off here, or in the settings drawer) ------------
const features: Record<string, boolean> = {
  booth: true,
  map: true,
  code: true,
  diff: true,
  graph: true,
  impact: true,
  explain: true,
  sketch: true,
  tests: true,
  trails: true,
  git: true,
  replay: true,
  menu: true,
  terminal: true,
  dishes: true,
  pianoroll: true,
  pitch: true,
  heartbeat: true,
  donut: true,
  stats: true,
  /** The generative sound (still silent until you press "Start Session"). */
  sound: true,
  /** The strip of meters (Fullness, The Tab, stars) and the avatar under the top bar. */
  hud: true,
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
  /** The dependency graph shows at most this many nodes; bigger projects fold folders into one node. */
  graphMaxNodes: 220,
  /** ...and at most this many function/class nodes in the function-level view. */
  graphMaxFunctionNodes: 260,
  /** Edges are thinned to this many (keeping the ones Claude touched and the strongest). */
  graphMaxEdges: 900,
};

// ---- the HUD (the game-style meters across the top) ------------------------------
const hud = {
  /** The Tab meter fills up as the cost approaches this many US dollars (a "budget" for the session). */
  tabBudgetUsd: 1,
  /** Michelin stars: you earn one star for every this-many menu items (todos) Claude finishes. Max 3 stars. */
  itemsPerStar: 3,
  /** The Fullness bar turns warm and then red at these fractions of the context window. */
  fullnessWarn: 0.7,
  fullnessDanger: 0.9,
};

// ---- sound -------------------------------------------------------------------
// Nothing plays until you press "Start Session" in the top bar. All sounds are made live
// by the browser (no audio files needed). To use your OWN sounds instead, drop files into
// the `userDir` folder: see user-audio/README.md for the file names.
const audio = {
  /** Starting volumes, 0 to 1. Change them in the sound menu; your changes are saved. */
  volumes: { master: 0.7, music: 0.55, tools: 0.6, ui: 0.5, alerts: 0.7 },
  /** Folder (next to this file) for your own sound files. */
  userDir: 'user-audio',
  /** The music is a loop of chords. Numbers are MIDI notes (60 = middle C, +1 = one semitone up). */
  chords: [
    [53, 57, 60, 64, 67], // Fmaj9    sweet
    [50, 53, 57, 60, 64], // Dm9      softer
    [46, 53, 57, 62, 64], // Bb lydian
    [48, 52, 55, 59, 61], // C with a flat 9: the "something is slightly wrong" chord
  ],
  /** How many beats each chord lasts. */
  beatsPerChord: 8,
  /** Loudness of each pad voice, and how much reverb ("room") is mixed in. */
  padLevel: 0.028,
  reverb: 0.45,
  /**
   * How the music changes with what Claude is doing.
   *   bpm      speed          cutoff  how bright (Hz; higher = brighter)
   *   level    music loudness  wobble  detune warble in cents (the "something broke" sound)
   */
  moods: {
    idle: { bpm: 50, cutoff: 800, level: 0.7, wobble: 0 },
    thinking: { bpm: 72, cutoff: 1500, level: 0.8, wobble: 0 },
    working: { bpm: 112, cutoff: 3600, level: 1, wobble: 0 },
    done: { bpm: 60, cutoff: 5200, level: 0.9, wobble: 0 },
    glitching: { bpm: 84, cutoff: 1000, level: 0.85, wobble: 48 },
  },
  /** Each tool call plays one note (MIDI) by its color-code kind. These all sit nicely on the chords above. */
  toolNotes: { read: 76, search: 79, edit: 81, create: 84, delete: 62, run: 72, other: 69 } as Record<Kind, number>,
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
  /**
   * Generated files (lockfiles, minified bundles) can be huge but tell you nothing.
   * On the map they are drawn no bigger than `generatedMaxLines`.
   */
  generatedPatterns: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'Gemfile.lock', 'composer.lock', '*.min.js', '*.min.css', '*.map'],
  generatedMaxLines: 120,
};

// ---- languages the code analyzer understands -------------------------------
// Each name must match a file in server/analysis/languages/ (added in the map stage).
const languages = ['typescript', 'python', 'go'];

export const config = {
  app,
  models,
  commands,
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
  dock,
  features,
  limits,
  hud,
  audio,
  scan,
  languages,
};

export type IndulgentConfig = typeof config;
export default config;
