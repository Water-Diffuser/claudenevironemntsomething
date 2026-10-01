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
  };
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
      d.chat.push({ type: 'turn', id, ok: e.ok, costUsd: e.costUsd, durationMs: e.durationMs, turns: e.turns, ts: e.ts });
      d.busy = false;
      d.live = null;
      d.phase = e.ok ? 'done' : 'error';
      d.usage = { ...d.usage, costUsd: d.usage.costUsd + e.costUsd, contextWindow: e.contextWindow ?? d.usage.contextWindow };
      break;
    case 'interrupted':
      stopUnfinishedTools(d);
      d.chat.push({ type: 'stopped', id, ts: e.ts });
      d.busy = false;
      d.live = null;
      d.phase = 'idle';
      break;
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
