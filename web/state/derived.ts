// ============================================================================
//  derived.ts: turn the event log into what the screen shows.
//
//  `Derived` is the "view" of a session at some point in time. Live, we apply
//  each new event as it arrives. For replay we simply rebuild a Derived from
//  the first N events. Later stages add more slices here (map, graph, tests...).
// ============================================================================
import type { Kind, SessionEvent, TodoItem } from '@shared/events';

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
}

export function emptyDerived(): Derived {
  return {
    count: 0,
    chat: [],
    toolIndex: new Map(),
    live: null,
    phase: 'idle',
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
  switch (e.kind) {
    case 'session_start':
      d.sessionId = e.sessionId;
      d.model = e.model;
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
      // Replace the provisional region with the real one, and record edits for the diff view.
      if (item?.type === 'tool') finishRegions(d, item, e);
      // Files a search found (Grep/Glob results) light up as SEARCHED.
      if (tp && tp.kind === 'search') for (const p of e.paths ?? []) touch(d, p, 'search', e.ts, false, { tool: 'search', toolId: e.toolId });
      break;
    }
    case 'usage':
      d.usage = { ...d.usage, contextTokens: e.contextTokens, outputTokens: d.usage.outputTokens + e.outputTokens };
      break;
    case 'todos':
      d.todos = e.items;
      break;
    case 'notice':
      d.chat.push({ type: 'notice', id, level: e.level, text: e.text, ts: e.ts });
      if (e.level === 'error') d.phase = 'error';
      break;
    case 'turn_end':
      stopUnfinishedTools(d);
      deactivateAll(d);
      d.chat.push({ type: 'turn', id, ok: e.ok, costUsd: e.costUsd, durationMs: e.durationMs, turns: e.turns, ts: e.ts });
      d.busy = false;
      d.live = null;
      d.phase = e.ok ? 'done' : 'error';
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
