# INDULGENT

A game-styled, local web UI for [Claude Code](https://docs.claude.com/en/docs/claude-code) that lets you **watch Claude move through your project**: a map of every file lights up as it reads, searches, edits and runs things, instead of a wall of chat text.

The mood is "half vocal-synth studio, half fancy restaurant": glossy hot pink on a dark stage, food words for everything, and a faint something-is-slightly-wrong under the sweetness. **You are the producer. Claude is the voice.**

> All visuals, names and writing are original. Only the *mood* of the glossy electropop / food / uncanny scene is borrowed. There is no copied art, logo, character or lyric anywhere.

Everything runs on your own computer. No accounts, no database, no cloud service of ours. Your settings and sessions are plain JSON files in `./data`.

---

## 1. Install and start

You need **Node.js 22** (20.19 or newer also works). Check with `node -v`. Get it from <https://nodejs.org>.

```bash
npm install        # downloads everything (once)
npm start          # starts the backend AND the page
```

Then open **<http://localhost:5173>** in your browser.

To stop: press `Ctrl+C` in the terminal.

**No key? No problem.** If INDULGENT can't find Claude credentials it starts in **Rehearsal** mode: a scripted fake session that behaves like a real one (reads, edits, runs tests, one failure on purpose) but never touches your files and costs nothing. It is the best way to explore the interface. Switch between **LIVE** and **REHEARSAL** at the top right.

### Using real Claude (LIVE mode)

INDULGENT talks to Claude through the official [Claude Agent SDK](https://docs.claude.com/en/docs/claude-code/sdk), which is the same engine as the `claude` command. It needs one of these:

**Option A: an API key** (simplest)

1. Go to <https://console.anthropic.com>, open **Settings → API Keys** and click **Create Key**. Copy it.
2. In the INDULGENT folder, copy the example file: `cp .env.example .env` (on Windows: `copy .env.example .env`).
3. Open `.env` in any text editor and paste your key after the equals sign: `ANTHROPIC_API_KEY=sk-ant-...`
4. Restart (`Ctrl+C`, then `npm start`).

**Option B: reuse your Claude Code login.** If you already use `claude` in a terminal and are logged in, leave `.env` empty. INDULGENT will find that login.

> Real Claude usage is billed to your account. The **The Tab** meter at the top shows what the current session has cost. The `.env` file is private (it is in `.gitignore`), but never share it.

### Safety

- The backend only listens on `127.0.0.1` (your own computer) and rejects requests from other websites.
- By default Claude **asks first** before it edits files or runs commands: a "May I?" popup appears and you press Allow or Deny. Change this with the dropdown at the top (*Ask me first / Auto-accept edits / Plan only*).
- INDULGENT only *reads* your git repository. It never commits or changes it itself (in Rehearsal mode a commit is only drawn on screen, never made).

---

## 2. The screen

Open a project with the folder button at the top (your "Kitchen"), press **New Take** and ask for something.

| Panel | What it shows |
| --- | --- |
| **The Booth** | The chat. Streaming answers, markdown, highlighted code, and a card for every tool Claude uses. |
| **Setlist** (left) | Your past sessions for this project. Click one to reopen it (Claude Code sessions made in a terminal are listed too). |
| **Cut Diagram** | A zoomable butcher's-cut treemap of every file. Bigger cell = more lines. Files light up in the color code and fade slowly. Click a file to open it. |
| **Pairings** | The dependency graph: arrows from importer to imported. Switch between files and functions. Edges pulse when Claude touches them. Big projects fold folders together to stay fast. |
| **The Pass** | The file Claude is in right now, in a real code editor with a minimap and a glowing cursor where Claude is working. |
| **The Remix** | Animated before/after diffs, with `+`/`−` lines and the functions that changed. |
| **Ripples** | After an edit: which other files and functions depend on what changed. |
| **Taste Test** | Test results as a grid of cells (red = failed, click for the message) and progress strips for long commands. |
| **Burn Marks** | Errors as a clickable chain of stack frames. Click a frame and the files flash on the map and graph. |
| **Recipe Book** | The git commit graph, the working tree as blocks, and Claude's own commits appearing as new nodes. |
| **Playback** | The replay scrubber. Drag it (or press play) and the map, graph and diff show that moment in the session. |
| **Floor Plan** | Ask Claude to sketch the architecture. It draws a diagram (Mermaid). |
| **Liner Notes** | Click anything (a file, function, cell) and press *Explain* for a short plain-English explanation. |
| **Piano Roll** | Every tool call is a note: color = kind of tool, length = how long it took, row = which folder. |
| **Pitch Curve** | Token usage over time as a line chart. |
| **Pulse** | A heartbeat monitor. Slow when waiting, fast when working, stuttering when something fails. |
| **The Pie** | Tool usage, as a sliced pie. |
| **The Receipt** | Files changed, commands run, time, errors, tokens. |
| **The Menu** | Claude's todo list as a multi-course menu. Items "plate" when served. |
| **Trophy Case** | Your achievements ("Dishes"). |

### The color code

One meaning per color, the same everywhere (map, graph, code, notes, cards):

| Color | Meaning |
| --- | --- |
| 🔵 blue | **READ** a file |
| 🟣 purple | **SEARCHED** (grep, glob) |
| 🩷 hot pink | **EDITED** a file |
| 🟢 green | **CREATED** a file |
| 🔴 red | **DELETED** something |
| 🟡 yellow | **RAN** a command |

You can change the colors and the words in the settings (see below).

### The game layer

- **The Voice** (top left) is a small original avatar whose face follows Claude: calm when idle, eyes up when thinking, a live waveform mouth when working, sparkles when done, a glitchy jitter when something failed.
- **Fullness** = how much of Claude's context window is used. **The Tab** = tokens and cost against a budget. **Stars** = a Michelin-style rating: one star for every three menu items served (change `hud.itemsPerStar` in the config).
- **Dishes** (achievements): *First Cut* (first edit), *Well Done* (tests pass), *Burnt* (three failures in a row), *Seconds* (ten files changed), and a few more. A toast pops up and it goes in the Trophy Case.

### Sound (optional, off until you ask)

Nothing makes any sound until you press **Start Session** at the top. Then:

- a soft generative chord pad plays: calm while waiting, brighter and quicker while Claude works, warbling out of tune when something fails, resolving to a bright chord when a take finishes;
- every tool call plays one note (pitch chosen by its color-code kind, all in the music's key);
- buttons and popups make glassy little chimes.

The speaker button opens master / music / tool-note / click / alert volume sliders and a mute switch. Volumes are saved. **Calm mode** turns the harsh sounds into one soft chime.

All sounds are created live by the browser, so no audio files are needed. To use your **own** sounds, drop files into the `user-audio/` folder, named after the sound (`click.wav`, `done.mp3`, `music-idle.ogg`...). The full list of names is in [`user-audio/README.md`](user-audio/README.md).

---

## 3. Make it yours

### The Mixing Desk (settings drawer)

Click the sliders icon at the top right. The drawer pushes the panels aside so you can see every change **live**. Everything is saved automatically.

| Tab | What you can change |
| --- | --- |
| **Look** | Mood presets (*Static*, *Spoken For* (default), *Human*, *Butcher Counter*, *Cardiac*), every color, the three fonts, font size, corner roundness, animation speed, and the effects: scanlines, VHS noise, glow, glitch, gloss. **Calm mode** switches off all flashing, glitching and fast motion. (Your system's "reduce motion" setting is respected too.) |
| **Colors** | The color code: the color **and the word** for READ, SEARCHED, EDITED... |
| **Panels** | Show or hide any panel, switch layouts (*Control Room*, *Map Room*, *Studio*, *Green Room*, *Test Kitchen*, *Inspector*, *Focus*), save what you see as a new layout, reset or delete layouts, turn whole features (HUD, sound) on or off. |
| **Words** | Rename any label in the app ("The Booth" → "The Cockpit"). |
| **Setup** | **Export** your whole setup to one JSON file, **Import** one, or reset everything. |

Panels can be dragged by their title bar, resized from the bottom-right corner, and hidden with the eye icon. The screen is always a 24 × 24 grid stretched to your window, so layouts survive any window size.

### The config file

[`indulgent.config.ts`](indulgent.config.ts) is the one file with all the defaults, written with comments: ports, labels, the color code, which Claude tool is which color, the mood presets, layouts, feature switches, performance limits, HUD numbers, sound (chords, tempo, notes), what the scanner skips, and which languages are understood. Whatever you change in the app is saved in `data/settings.json` and wins over the config file. Delete that file to go back to the defaults.

### Recipe: add a theme (mood preset)

In `indulgent.config.ts`, copy one entry of the `themes` object, give it a new key and change the values:

```ts
const themes: Record<string, Theme> = {
  // ...the existing ones...
  'late-night': {
    label: 'Late Night',
    blurb: 'Deep blue, warm lamplight.',
    dark: true,
    colors: { bg: '#070a14', bgAlt: '#0b1020', surface: '#111832', surfaceHi: '#1a2450', border: '#2a3a78',
              text: '#eef2ff', textDim: '#8e9bd0', accent: '#ffb347', accent2: '#ffd9a0', onAccent: '#1a1000',
              good: '#4cf0a0', bad: '#ff5a6e', warn: '#ffd54a' },
    fonts: { display: FRAUNCES, body: NUNITO, mono: JETBRAINS },
    fontSize: 15, radius: 12, animSpeed: 1,
    effects: { scanlines: 0, noise: 0.05, glow: 0.5, glitch: 0.1, gloss: 0.5 },
  },
};
```

It appears in **Look → Mood** straight away. (To make it the default, set `defaultTheme = 'late-night'`.)

### Recipe: add a panel

1. Make a component, for example `web/panels/hello/HelloPanel.tsx`. Read what Claude is doing with `useDerived()` (everything Claude did, already digested: files touched, edits, tests, todos, tokens...).

   ```tsx
   import { useDerived } from '../../state/store';

   export default function HelloPanel() {
     const d = useDerived();
     return <div className="p-3">Claude has touched {d.touched.size} files.</div>;
   }
   ```

2. In `web/panels/registry.tsx` add a lazy import and one line to the `PANELS` list:
   ```ts
   const HelloPanel = lazy(() => import('./hello/HelloPanel'));
   // ...in PANELS:
   { id: 'hello', label: 'hello', icon: Smile, component: HelloPanel, minW: 4, minH: 3 },
   ```
3. In `indulgent.config.ts` add `hello: 'Hello'` to `labels`, `hello: true` to `features`, and a position in the layouts you want it in: `{ i: 'hello', x: 0, y: 0, w: 6, h: 6 }`. (Without step 3's layout entry it still shows up in **Panels** and can be ticked on.)

Panels automatically follow the **replay scrubber**, because `useDerived()` returns the replayed moment while you scrub.

### Recipe: add a language

The code analyzer (map symbols, dependency graph, impact view) uses [tree-sitter](https://tree-sitter.github.io/). JavaScript/TypeScript, Python and Go ship in the box. Teaching it another language is **one small file** in `server/analysis/languages/`; [`go.ts`](server/analysis/languages/go.ts) (about 100 lines, heavily commented) is the worked example. A plugin says three things:

```ts
import { defineLanguage } from './types.ts';

export default defineLanguage({
  id: 'rust',
  label: 'Rust',
  extensions: ['.rs'],
  grammar: () => 'rust',      // name of a grammar in node_modules/tree-sitter-wasms/out/ (tree-sitter-<name>.wasm)
  commentPrefix: '//',
  extract(root) { /* walk the syntax tree: return { imports, symbols } */ },
  createResolver(projectRoot, files) { return (importText, fromFile) => /* a project file path, or null */; },
});
```

Then add the id to `languages` in `indulgent.config.ts`: `const languages = ['typescript', 'python', 'go', 'rust'];`. Restart. To explore a grammar's node names, look at how `go.ts` or `python.ts` ask for things like `childForFieldName('name')` and `descendantsOfType('call_expression')`. Files in languages without a plugin still appear on the map (sized by lines); they just have no graph connections.

### Recipe: add a Dish (achievement)

Add one object to `DISHES` in `web/state/dishes.ts`. `test` receives the digested session and returns true once it is earned:

```ts
{ id: 'night-owl', name: 'Night Owl', blurb: 'Ran a command after midnight.', hint: 'Work late.', icon: Wine,
  test: (d) => d.stats.commands > 0 && new Date().getHours() < 5 },
```

---

## 4. How it works (for the curious)

```
 Claude Agent SDK ──► EventMapper ──► flat "SessionEvents" ──► WebSocket ──► browser
 (or Rehearsal)       (server/claude)  one small JSON each      /ws          derived.ts
                                                                               │
                                       every panel is a function of the log ◄──┘
```

Everything Claude does becomes a flat list of small events (`shared/events.ts`). The browser folds that list into one "derived" view (`web/state/derived.ts`) and every panel draws from it. That is why **replay** is easy: it feeds the same code only the first *N* events.

```
indulgent.config.ts     the one config file
user-audio/             drop your own sound files here
data/                   your settings and sessions (JSON), created on first run
shared/                 types and parsers used by both sides (events, test-output parsers...)
server/
  index.ts              Express + WebSocket, localhost only
  runtime.ts            owns the project, the current session, permissions
  claude/               talks to the Agent SDK (live.ts), the fake session (rehearsal.ts), event mapping
  analysis/             file scanner, tree-sitter parser, one plugin per language
  git/                  read-only git state (simple-git)
  store/                the tiny JSON-file "database"
web/
  App.tsx               the shell
  state/                the store, the derived view, settings, dishes
  panels/               one folder per panel + registry.tsx
  components/           top bar, HUD, popups, avatar...
  settings/             the Mixing Desk (settings drawer)
  audio/                the sound engine and the director that decides when sounds play
  theme/                turns a theme into CSS variables
  styles/index.css      every color, font and effect comes from a CSS variable
```

Built with TypeScript, a Node backend (Express, `ws`, chokidar, simple-git, web-tree-sitter), React 19 + Vite, Tailwind and CSS variables, React Flow (graph), d3-hierarchy (map), Recharts (charts), Monaco (code view), react-grid-layout (panels), Framer Motion (animation) and the Web Audio API (sound).

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Backend + page, with auto-reload. This is the one you want. |
| `npm run build` | Builds the page into `dist/web`. After that the backend also serves it at <http://127.0.0.1:4317>. |
| `npm run typecheck` | Checks all the TypeScript. |

Environment variables (in `.env`, all optional): `ANTHROPIC_API_KEY`, `INDULGENT_MODE` (`live` or `rehearsal`), `INDULGENT_PORT`, `INDULGENT_DATA` (where to save), `INDULGENT_KEEP_ENV=1` (pass your whole environment to Claude untouched; by default variables that belong to *another* Claude Code session are filtered out).

---

## 5. Troubleshooting

- **"Can't reach the backend"**: `npm start` isn't running, or port 4317 is taken. Change `serverPort` in the config (and restart).
- **The page says REHEARSAL and LIVE doesn't work**: no credentials were found. Follow *Using real Claude* above. The error message in the chat says exactly what Claude complained about.
- **Nothing happens when I press Start Session / no sound**: check your system volume and that the tab isn't muted. Press the speaker button and look at the sliders (and the mute button).
- **The map is empty**: the folder has no readable files, or everything is in an ignored folder (`node_modules`, `dist`, ... see `scan.ignoreDirs`).
- **Huge project feels slow**: lower `limits.graphMaxNodes` / `limits.graphMaxEdges`, or `scan.maxFiles`. The graph already folds folders when a project is large, and long lists are virtualized.
- **I want it quieter / calmer**: Mixing Desk → Look → **Calm mode**.
- **Start fresh**: delete `data/settings.json` (look and layouts) and/or `data/sessions/` (history).

Have a good service.
