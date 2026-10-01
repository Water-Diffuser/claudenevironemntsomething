// ============================================================================
//  SESSION EVENTS
//  Everything Claude does is turned into a flat list of small "events".
//  The whole UI (chat, map, graph, replay...) is just a function of that list.
//  That is what makes the replay scrubber possible: replay = "show the UI as it
//  looked after the first N events".
// ============================================================================

/** The color-code categories. Colors for each live in indulgent.config.ts. */
export type Kind = 'read' | 'search' | 'edit' | 'create' | 'delete' | 'run' | 'other';

export const KINDS: Kind[] = ['read', 'search', 'edit', 'create', 'delete', 'run', 'other'];

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  /** Present-tense wording, e.g. "Running tests". */
  activeForm?: string;
}

/** The "body" of an event: what happened. */
export type SessionEventBody =
  | { kind: 'session_start'; sessionId: string; cwd: string; model?: string; rehearsal: boolean; authSource?: string }
  | { kind: 'user_message'; text: string }
  | { kind: 'assistant_text'; messageId: string; text: string }
  | { kind: 'thinking'; messageId: string }
  | {
      kind: 'tool_start';
      toolId: string;
      tool: string;
      /** Which color-code category this call belongs to. */
      toolKind: Kind;
      /** The raw tool input (long strings are trimmed). */
      input: Record<string, unknown>;
      /** Files this call touches, relative to the project when possible. */
      paths: string[];
      /** One-line human description, e.g. "src/app.ts" or "npm test". */
      summary: string;
      /** Set when this call was made by a sub-agent. */
      parentToolId?: string | null;
    }
  | {
      kind: 'tool_end';
      toolId: string;
      ok: boolean;
      /** Text the tool returned (trimmed). */
      output: string;
      durationMs: number;
      /** Files discovered by the call (e.g. the files a Grep/Glob matched). */
      paths?: string[];
      /** Structured result data when the tool provides it (e.g. an Edit's patch). */
      data?: unknown;
    }
  | {
      kind: 'permission';
      requestId: string;
      toolId: string;
      tool: string;
      decision: 'asked' | 'allowed' | 'denied';
    }
  | {
      kind: 'usage';
      messageId: string;
      inputTokens: number;
      outputTokens: number;
      cacheRead: number;
      cacheCreate: number;
      /** Tokens currently sitting in the context window. */
      contextTokens: number;
    }
  | { kind: 'todos'; items: TodoItem[] }
  | {
      kind: 'turn_end';
      ok: boolean;
      costUsd: number;
      durationMs: number;
      turns: number;
      /** Size of the model's context window, when the SDK tells us. */
      contextWindow?: number;
      error?: string;
    }
  | { kind: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
  /** A file changed on disk while Claude was working (catches edits made by shell commands). */
  | { kind: 'fs_change'; path: string; change: 'add' | 'change' | 'unlink' }
  | { kind: 'interrupted' };

export type SessionEvent = SessionEventBody & {
  /** Position in the log (0, 1, 2...). */
  seq: number;
  /** Milliseconds since epoch. */
  ts: number;
};

/** Distributes Omit over a union (plain Omit would collapse the union). */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
