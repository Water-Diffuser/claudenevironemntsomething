// ============================================================================
//  derived.ts: turn the event log into what the screen shows.
//
//  `Derived` is the "view" of a session at some point in time. Live, we apply
//  each new event as it arrives. For replay we simply rebuild a Derived from
//  the first N events. Later stages add more slices here (map, graph, tests...).
// ============================================================================
import type { Kind, SessionEvent, TodoItem } from '@shared/events';
import { parseCommand, type CommandReport } from '@shared/parse/command';
import { parseStack, type StackFrame } from '@shared/parse/stack';
import { isTestCommand, parseTests, type TestCase, type TestRun } from '@shared/parse/tests';

export type ChatItem =
  | { type: 'user'; id: string; text: string; ts: number }
  | { type: 'assistant'; id: string; text: string; ts: number }
  | {
      type: 'tool';
      id: string;
      toolId: string;
      tool: string;
      toolKind: Kind;
      summary: string;
      input: Record<string, unknown>;
      paths: string[];
      status: 'waiting' | 'running' | 'ok' | 'error' | 'denied' | 'stopped';
      output?: string;
      durationMs?: number;
      parentToolId?: string | null;
      ts: number;
    }
  | { type: 'notice'; id: string; level: 'info' | 'warn' | 'error'; text: string; ts: number }
  | { type: 'turn'; id: string; ok: boolean; costUsd: number; durationMs: number; turns: number; ts: number }
  | { type: 'stopped'; id: string; ts: number };

/** What Claude has done to one file (or folder). Drives the map and graph glow. */
export interface Touch {
  /** The most recent kind of touch. */
  kind: Kind;
  /** When it happened (event time, so replay works too). */
  ts: number;
  /** True while the tool call is still running. */
  active: boolean;
  count: number;
  /** How many times each kind of touch happened. */
  kinds: Partial<Record<Kind, number>>;
  /** For newly created files: how many lines Claude wrote (helps size the ghost cell). */
  lines?: number;
}

export interface HistoryEntry {
  ts: number;
  kind: Kind;
  tool: string;
  toolId: string;
}

/** A stretch of lines in a file that Claude read / edited / created. */
export interface Region {
  kind: Kind;
  /** 1-based, inclusive. */
  start: number;
  end: number;
  ts: number;
  toolId: string;
  /** True while the tool call is still running (the region is provisional). */
  active: boolean;
}

/** Where Claude is "standing" in the code right now. Drives the cursor marker in the code view. */
export interface CursorPos {
  path: string;
  line: number;
  endLine?: number;
  kind: Kind;
  ts: number;
  active: boolean;
  toolId: string;
}

/** One hunk of a unified diff: lines start with ' ' (unchanged), '-' (removed) or '+' (added). */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/** One edit Claude made, with enough detail to draw an animated diff. */
export interface EditRecord {
  id: string;
  toolId: string;
  path: string;
  tool: string;
  ts: number;
  type: 'edit' | 'create';
  hunks: Hunk[];
  added: number;
  removed: number;
  /** Changed line ranges in the NEW file (used to find which functions changed). */
  newRanges: Array<[number, number]>;
}

/** One hop of Claude's path through the project: it went from file `from` to file `to`. */
export interface TrailHop {
  from: string;
  to: string;
  ts: number;
  kind: Kind;
}

/** One shell command Claude ran (tests, builds, installs...). */
export interface RunRecord {
  id: string;
  toolId: string;
  command: string;
  description?: string;
  /** When it started / finished (event time). */
  startTs: number;
  ts: number;
  running: boolean;
  ok: boolean;
  durationMs?: number;
  /** Set when the output was recognized as a test run. */
  tests?: TestRun;
  /** Otherwise: a short summary of the output. */
  report?: CommandReport;
  /** The full output, for when you click "show output". */
  output: string;
  /** Tests from the previous run, shown as "running" cells until this run reports. */
  expected?: TestCase[];
}

/** Something that went wrong, with the chain of code locations that led to it. */
export interface ErrorRecord {
  id: string;
  ts: number;
  source: 'test' | 'command' | 'tool';
  title: string;
  message: string;
  /** Frame 0 is where it failed; later frames are callers. */
  frames: StackFrame[];
  runId?: string;
}

/** A moment when files should flash on the map and graph (because an error pointed at them). */
export interface Flash {
  ts: number;
  paths: string[];
}

/** One tool call as a "note" on the piano roll. */
export interface CallNote {
  id: string;
  tool: string;
  kind: Kind;
  start: number;
  /** undefined while the call is still running. */
  end?: number;
  /** The folder this call worked in (the note's row), or "shell" / "web" / "misc". */
  lane: string;
  /** What it did, in a few words (e.g. the file path or command). */
  summary: string;
  ok?: boolean;
}

/** One point on the pitch curve (token usage over time). */
export interface TokenPoint {
  ts: number;
  /** Tokens in the context window at this moment. */
  context: number;
  /** Output tokens written so far (cumulative). */
  output: number;
}

/** What Claude is doing right now (drives the avatar and heartbeat later). */
export type Phase = 'idle' | 'thinking' | 'working' | 'done' | 'error';

export interface Derived {
  /** Number of events applied so far. */
  count: number;
  chat: ChatItem[];
  /** toolId -> index in `chat`, so tool results can find their card. */
  toolIndex: Map<string, number>;
  /** Text that is streaming in right now (not yet a finished message). */
  live: { messageId: string; text: string } | null;
  phase: Phase;
  /** When the phase last changed to done/error (the avatar celebrates / glitches for a few seconds). */
  phaseTs: number;
  busy: boolean;
  todos: TodoItem[];
  sessionId: string | null;
  model?: string;
  usage: { contextTokens: number; contextWindow: number; outputTokens: number; costUsd: number };
  /** path -> what Claude did to it. */
  touched: Map<string, Touch>;
  /** path -> the last few things Claude did to it. */
  history: Map<string, HistoryEntry[]>;
  /** toolId -> the files that call touches (so tool_end can switch them off). */
  toolPaths: Map<string, { paths: string[]; kind: Kind }>;
  /** Tool calls running right now (toolId -> kind). Lets the map shimmer while a command runs. */
  running: Map<string, Kind>;
  /** path -> stretches of lines Claude read / edited / created. */
  regions: Map<string, Region[]>;
  /** Where Claude last was (or is, if active) in the code. */
  cursor: CursorPos | null;
  /** Every edit Claude made, oldest first (capped). */
  edits: EditRecord[];
  /** The path Claude walked through the files (the graph draws it as a glowing trail). */
  trail: TrailHop[];
  /** The project folder (from the session start). */
  cwd: string;
  /** Shell commands Claude ran, oldest first (capped). */
  runs: RunRecord[];
  /** Errors, oldest first (capped). */
  errors: ErrorRecord[];
  /** Files to flash because an error pointed at them. */
  flashes: Flash[];
  /** Every tool call, as notes for the piano roll (capped). */
  calls: CallNote[];
  /** Token usage over time, for the pitch curve (capped). */
  series: TokenPoint[];
  /** Numbers for the stats card and the donut. */
  stats: {
    filesChanged: Set<string>;
    commands: number;
    errors: number;
    toolCounts: Record<string, number>;
    kindCounts: Partial<Record<Kind, number>>;
    firstTs: number | null;
    lastTs: number;
  };
  /** Failed tool calls in a row (reset by any success). */
  streak: { current: number; max: number };
  /** Menu items Claude finished (by name), and how many takes finished OK (for the Michelin stars). */
  served: Set<string>;
  turnsOk: number;
  testsPassed: boolean;
  committed: boolean;
  /** Files created during the session so far (replay hides the ones that don't exist yet at the chosen moment). */
  created: Set<string>;
  /** The tests seen in the most recent test run (so the next run can show them as "running"). */
  lastTests: TestCase[];
}

export function emptyDerived(): Derived {
  return {
    count: 0,
    chat: [],
    toolIndex: new Map(),
    live: null,
    phase: 'idle',
    phaseTs: 0,
    busy: false,
    todos: [],
    sessionId: null,
    usage: { contextTokens: 0, contextWindow: 200_000, outputTokens: 0, costUsd: 0 },
    touched: new Map(),
    history: new Map(),
    toolPaths: new Map(),
    running: new Map(),
    regions: new Map(),
    cursor: null,
    edits: [],
    trail: [],
    cwd: '',
    runs: [],
    errors: [],
    flashes: [],
    created: new Set(),
    calls: [],
    series: [],
    stats: { filesChanged: new Set(), commands: 0, errors: 0, toolCounts: {}, kindCounts: {}, firstTs: null, lastTs: 0 },
    streak: { current: 0, max: 0 },
    served: new Set(),
    turnsOk: 0,
    testsPassed: false,
    committed: false,
    lastTests: [],
  };
}

/** Record that something happened to a path. */
function touch(d: Derived, path: string, kind: Kind, ts: number, active: boolean, opts: { tool: string; toolId: string; lines?: number; count?: boolean }) {
  const t = d.touched.get(path) ?? { kind, ts, active, count: 0, kinds: {} };
  t.kind = kind;
  t.ts = ts;
  t.active = active;
  if (opts.count !== false) {
    t.count++;
    t.kinds[kind] = (t.kinds[kind] ?? 0) + 1;
    const h = d.history.get(path) ?? [];
    h.push({ ts, kind, tool: opts.tool, toolId: opts.toolId });
    if (h.length > 30) h.shift();
    d.history.set(path, h);
  }
  if (opts.lines) t.lines = opts.lines;
  d.touched.set(path, t);
}

/** Line ranges (in the new file) that a diff hunk adds. A pure deletion marks the line where text vanished. */
function addedRanges(h: Hunk): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let n = h.newStart;
  let runStart = -1;
  let deleted = false;
  const close = () => {
    if (runStart >= 0) out.push([runStart, n - 1]);
    else if (deleted) out.push([Math.max(1, n), Math.max(1, n)]);
    runStart = -1;
    deleted = false;
  };
  for (const line of h.lines) {
    const c = line[0];
    if (c === '+') {
      if (runStart < 0) runStart = n;
      n++;
    } else if (c === '-') {
      if (runStart < 0) deleted = true;
    } else {
      close();
      n++;
    }
  }
  close();
  return out;
}

const MAX_REGIONS_PER_FILE = 150;

function addRegion(d: Derived, path: string, r: Region) {
  const list = d.regions.get(path) ?? [];
  list.push(r);
  if (list.length > MAX_REGIONS_PER_FILE) list.shift();
  d.regions.set(path, list);
}

function dropRegionsOf(d: Derived, toolId: string, path: string) {
  const list = d.regions.get(path);
  if (list) d.regions.set(path, list.filter((r) => r.toolId !== toolId));
}

function deactivateAll(d: Derived) {
  for (const list of d.regions.values()) for (const r of list) r.active = false;
  if (d.cursor) d.cursor = { ...d.cursor, active: false };
  for (const t of d.touched.values()) t.active = false;
  d.running.clear();
}

/** Apply ONE event. Mutates `d` (fast), but replaces chat items instead of editing them, so React can tell what changed. */
export function applyEvent(d: Derived, e: SessionEvent): void {
  d.count++;
  const id = `e${e.seq}`;
  if (d.stats.firstTs === null) d.stats.firstTs = e.ts;
  d.stats.lastTs = e.ts;
  switch (e.kind) {
    case 'session_start':
      d.sessionId = e.sessionId;
      d.model = e.model;
      d.cwd = e.cwd;
      break;
    case 'user_message':
      d.chat.push({ type: 'user', id, text: e.text, ts: e.ts });
      d.busy = true;
      d.phase = 'thinking';
      break;
    case 'thinking':
      if (d.busy) d.phase = 'thinking';
      break;
    case 'assistant_text':
      // The finished text replaces the streaming bubble.
      if (d.live?.messageId === e.messageId) d.live = null;
      d.chat.push({ type: 'assistant', id, text: e.text, ts: e.ts });
      if (d.busy) d.phase = 'thinking';
      break;
    case 'tool_start': {
      d.toolIndex.set(e.toolId, d.chat.length);
      d.chat.push({
        type: 'tool',
        id,
        toolId: e.toolId,
        tool: e.tool,
        toolKind: e.toolKind,
        summary: e.summary,
        input: e.input,
        paths: e.paths,
        status: 'running',
        parentToolId: e.parentToolId,
        ts: e.ts,
      });
      if (d.busy) d.phase = 'working';
      // Light up the files this call touches.
      d.toolPaths.set(e.toolId, { paths: e.paths, kind: e.toolKind });
      d.running.set(e.toolId, e.toolKind);
      const written = typeof e.input.content === 'string' ? e.input.content.split('\n').length : undefined;
      for (const p of e.paths) touch(d, p, e.toolKind, e.ts, true, { tool: e.tool, toolId: e.toolId, lines: e.toolKind === 'create' ? written : undefined });
      // Notes for the piano roll, and counters for the donut/stats.
      {
        const first = e.paths[0] ?? '';
        const lane = first && first !== '.' ? (first.includes('/') ? first.split('/')[0] : '(root)') : e.tool === 'Bash' ? 'shell' : /^Web/.test(e.tool) ? 'web' : 'misc';
        d.calls.push({ id: e.toolId, tool: e.tool, kind: e.toolKind, start: e.ts, lane, summary: e.summary });
        if (d.calls.length > 1500) d.calls.shift();
        d.stats.toolCounts[e.tool] = (d.stats.toolCounts[e.tool] ?? 0) + 1;
        d.stats.kindCounts[e.toolKind] = (d.stats.kindCounts[e.toolKind] ?? 0) + 1;
        if (e.tool === 'Bash') d.stats.commands++;
      }
      // A shell command: start tracking it as a "run" (tests, build...).
      if (e.tool === 'Bash' && typeof e.input.command === 'string') {
        d.runs.push({
          id: `run-${e.toolId}`,
          toolId: e.toolId,
          command: e.input.command,
          description: typeof e.input.description === 'string' ? e.input.description : undefined,
          startTs: e.ts,
          ts: e.ts,
          running: true,
          ok: true,
          output: '',
          expected: isTestCommand(e.input.command) && d.lastTests.length ? d.lastTests.map((t) => ({ ...t, status: 'running' as const, error: undefined })) : undefined,
        });
        if (d.runs.length > 60) d.runs.shift();
      }
      // Record the hop from the previous file to this one (the graph shows Claude's path).
      if (e.paths[0] && e.toolKind !== 'search' && e.toolKind !== 'run' && e.toolKind !== 'other') {
        const last = d.trail[d.trail.length - 1];
        const from = last?.to ?? d.cursor?.path;
        if (from && from !== e.paths[0]) {
          d.trail.push({ from, to: e.paths[0], ts: e.ts, kind: e.toolKind });
          if (d.trail.length > 80) d.trail.shift();
        } else if (!from) d.trail.push({ from: e.paths[0], to: e.paths[0], ts: e.ts, kind: e.toolKind });
      }
      // The cursor jumps to where this call works, with a provisional highlighted region.
      if (e.loc && e.paths[0] && (e.toolKind === 'read' || e.toolKind === 'edit' || e.toolKind === 'create')) {
        d.cursor = { path: e.paths[0], line: e.loc.startLine, endLine: e.loc.endLine, kind: e.toolKind, ts: e.ts, active: true, toolId: e.toolId };
        addRegion(d, e.paths[0], { kind: e.toolKind, start: e.loc.startLine, end: e.loc.endLine ?? e.loc.startLine, ts: e.ts, toolId: e.toolId, active: true });
      }
      break;
    }
    case 'fs_change': {
      const kind: Kind = e.change === 'add' ? 'create' : e.change === 'unlink' ? 'delete' : 'edit';
      if (e.change === 'add') d.created.add(e.path);
      d.stats.filesChanged.add(e.path);
      touch(d, e.path, kind, e.ts, false, { tool: 'shell', toolId: id });
      break;
    }
    case 'permission': {
      const i = d.toolIndex.get(e.toolId);
      const item = i === undefined ? undefined : d.chat[i];
      if (item?.type === 'tool') {
        const status = e.decision === 'asked' ? 'waiting' : e.decision === 'denied' ? 'denied' : 'running';
        d.chat[i!] = { ...item, status };
      }
      break;
    }
    case 'tool_end': {
      const i = d.toolIndex.get(e.toolId);
      const item = i === undefined ? undefined : d.chat[i];
      if (item?.type === 'tool') {
        const status = item.status === 'denied' ? 'denied' : e.ok ? 'ok' : 'error';
        d.chat[i!] = { ...item, status, output: e.output, durationMs: e.durationMs };
      }
      // The call is over: switch its files from "active" to "recently touched".
      d.running.delete(e.toolId);
      const tp = d.toolPaths.get(e.toolId);
      for (const p of tp?.paths ?? []) {
        const t = d.touched.get(p);
        if (t) (t.active = false), (t.ts = e.ts);
      }
      if (item?.type === 'tool') finishRun(d, item, e);
      if (item?.type === 'tool' && item.toolKind === 'create' && e.ok && item.paths[0]) d.created.add(item.paths[0]);
      // finish the piano-roll note, and keep the error streak / files-changed counters
      {
        const note = [...d.calls].reverse().find((n) => n.id === e.toolId);
        if (note) (note.end = e.ts), (note.ok = e.ok);
        const denied = item?.type === 'tool' && item.status === 'denied';
        if (!denied) {
          if (e.ok) d.streak.current = 0;
          else (d.streak.current++, d.stats.errors++, (d.streak.max = Math.max(d.streak.max, d.streak.current)));
        }
        if (item?.type === 'tool' && e.ok && (item.toolKind === 'edit' || item.toolKind === 'create' || item.toolKind === 'delete')) for (const p of item.paths) d.stats.filesChanged.add(p);
        if (item?.type === 'tool' && e.ok && item.tool === 'Bash' && /git\s+commit/.test(String(item.input.command ?? ''))) d.committed = true;
      }
      // Replace the provisional region with the real one, and record edits for the diff view.
      if (item?.type === 'tool') finishRegions(d, item, e);
      // Files a search found (Grep/Glob results) light up as SEARCHED.
      if (tp && tp.kind === 'search') for (const p of e.paths ?? []) touch(d, p, 'search', e.ts, false, { tool: 'search', toolId: e.toolId });
      break;
    }
    case 'usage':
      d.usage = { ...d.usage, contextTokens: e.contextTokens, outputTokens: d.usage.outputTokens + e.outputTokens };
      d.series.push({ ts: e.ts, context: e.contextTokens, output: d.usage.outputTokens });
      if (d.series.length > 800) d.series.splice(0, d.series.length - 800);
      break;
    case 'todos':
      d.todos = e.items;
      for (const t of e.items) if (t.status === 'completed') d.served.add(t.content);
      break;
    case 'notice':
      d.chat.push({ type: 'notice', id, level: e.level, text: e.text, ts: e.ts });
      if (e.level === 'error') (d.phase = 'error'), (d.phaseTs = e.ts);
      break;
    case 'turn_end':
      stopUnfinishedTools(d);
      deactivateAll(d);
      d.chat.push({ type: 'turn', id, ok: e.ok, costUsd: e.costUsd, durationMs: e.durationMs, turns: e.turns, ts: e.ts });
      d.busy = false;
      d.live = null;
      d.phase = e.ok ? 'done' : 'error';
      if (e.ok) d.turnsOk++;
      d.phaseTs = e.ts;
      d.usage = { ...d.usage, costUsd: d.usage.costUsd + e.costUsd, contextWindow: e.contextWindow ?? d.usage.contextWindow };
      break;
    case 'interrupted':
      stopUnfinishedTools(d);
      deactivateAll(d);
      d.chat.push({ type: 'stopped', id, ts: e.ts });
      d.busy = false;
      d.live = null;
      d.phase = 'idle';
      break;
  }
}

const MAX_ERRORS = 80;

function addError(d: Derived, err: ErrorRecord) {
  d.errors.push(err);
  if (d.errors.length > MAX_ERRORS) d.errors.shift();
  // The project files in the chain flash on the map and graph.
  const paths = [...new Set(err.frames.filter((f) => !f.external).map((f) => f.file))];
  if (paths.length) {
    d.flashes.push({ ts: err.ts, paths });
    if (d.flashes.length > 40) d.flashes.shift();
  }
}

/** A tool call finished: if it was a shell command, understand its output (tests? build? errors?). */
function finishRun(d: Derived, item: Extract<ChatItem, { type: 'tool' }>, e: Extract<SessionEvent, { kind: 'tool_end' }>) {
  const run = d.runs.find((r) => r.toolId === e.toolId);
  if (item.tool === 'Bash' && run) {
    run.running = false;
    run.ts = e.ts;
    run.durationMs = e.durationMs;
    run.output = e.output;
    run.expected = undefined;
    const tests = isTestCommand(run.command) ? parseTests(e.output, d.cwd) : null;
    if (tests) {
      run.tests = tests;
      run.ok = e.ok && tests.failed === 0;
      if (tests.failed === 0 && tests.passed > 0) d.testsPassed = true;
      d.lastTests = tests.cases.map((c) => ({ ...c, error: undefined }));
      for (const c of tests.cases.filter((x) => x.status === 'fail').slice(0, 20)) {
        addError(d, { id: `err-${run.id}-${c.id}`, ts: e.ts, source: 'test', title: c.suite ? `${c.suite} › ${c.name}` : c.name, message: c.error?.message ?? 'test failed', frames: c.error?.frames ?? [], runId: run.id });
      }
    } else {
      run.ok = e.ok;
      run.report = parseCommand(run.command, e.output, e.ok, d.cwd);
      if (!e.ok || run.report.problems.some((p) => p.severity === 'error')) {
        const stack = parseStack(e.output, d.cwd);
        const fromProblems: StackFrame[] = run.report.problems.filter((p) => p.severity === 'error').slice(0, 12).map((p) => ({ raw: `${p.file}:${p.line}`, file: p.file, line: p.line, col: p.col, fn: p.code, external: false }));
        const frames = stack.length ? stack : fromProblems;
        if (!e.ok || frames.length) addError(d, { id: `err-${run.id}`, ts: e.ts, source: 'command', title: run.command.split('\n')[0].slice(0, 80), message: run.report.highlights[0] ?? 'command failed', frames, runId: run.id });
      }
    }
    return;
  }
  // Some other tool failed (e.g. reading a file that doesn't exist).
  if (!e.ok && item.status !== 'denied') {
    addError(d, { id: `err-${e.toolId}`, ts: e.ts, source: 'tool', title: `${item.tool} ${item.summary}`.slice(0, 80), message: e.output.split('\n')[0].slice(0, 200), frames: item.paths[0] ? [{ raw: item.paths[0], file: item.paths[0], line: 1, external: false }] : [] });
  }
}

/** A tool call finished: turn its provisional highlight into the real one, and remember edits. */
function finishRegions(d: Derived, item: Extract<ChatItem, { type: 'tool' }>, e: Extract<SessionEvent, { kind: 'tool_end' }>) {
  const path = item.paths[0];
  if (!path) return;
  dropRegionsOf(d, e.toolId, path);
  if (d.cursor?.toolId === e.toolId) d.cursor = { ...d.cursor, active: false };
  if (!e.ok) return;
  const data = e.data as { file?: { startLine?: number; numLines?: number; totalLines?: number }; structuredPatch?: Hunk[]; type?: string } | undefined;

  if (item.tool === 'Read') {
    const f = data?.file;
    const start = f?.startLine ?? 1;
    const end = f?.numLines ? start + f.numLines - 1 : (f?.totalLines ?? start);
    addRegion(d, path, { kind: 'read', start, end, ts: e.ts, toolId: e.toolId, active: false });
    return;
  }

  if (item.toolKind === 'edit' || item.toolKind === 'create') {
    const hunks = Array.isArray(data?.structuredPatch) ? data!.structuredPatch! : [];
    const content = typeof item.input.content === 'string' ? item.input.content : '';
    let records: Hunk[] = hunks;
    const isCreate = item.toolKind === 'create' || data?.type === 'create';
    // A brand-new file has no "before": show the whole content as added lines.
    if (isCreate && records.length === 0 && content) {
      const lines = content.replace(/\n$/, '').split('\n');
      records = [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map((l) => `+${l}`) }];
    }
    if (records.length === 0) return;
    const ranges = records.flatMap(addedRanges);
    let added = 0;
    let removed = 0;
    for (const h of records) for (const l of h.lines) l[0] === '+' ? added++ : l[0] === '-' ? removed++ : 0;
    for (const [a, b] of ranges) addRegion(d, path, { kind: isCreate ? 'create' : 'edit', start: a, end: b, ts: e.ts, toolId: e.toolId, active: false });
    if (ranges[0]) d.cursor = { path, line: ranges[0][0], kind: item.toolKind, ts: e.ts, active: false, toolId: e.toolId };
    d.edits.push({ id: `edit-${e.toolId}`, toolId: e.toolId, path, tool: item.tool, ts: e.ts, type: isCreate ? 'create' : 'edit', hunks: records, added, removed, newRanges: ranges });
    if (d.edits.length > 120) d.edits.shift();
  }
}

/** When a turn ends, any tool still marked running/waiting never finished (e.g. you pressed Stop). */
function stopUnfinishedTools(d: Derived) {
  for (const i of d.toolIndex.values()) {
    const item = d.chat[i];
    if (item?.type === 'tool' && (item.status === 'running' || item.status === 'waiting')) d.chat[i] = { ...item, status: 'stopped' };
  }
}

/** Rebuild the view after the first `upTo` events (used on session switch and for replay). */
export function computeDerived(events: SessionEvent[], upTo = events.length): Derived {
  const d = emptyDerived();
  for (let i = 0; i < upTo; i++) applyEvent(d, events[i]);
  return d;
}
