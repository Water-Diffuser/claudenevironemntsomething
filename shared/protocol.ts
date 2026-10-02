// ============================================================================
//  WIRE PROTOCOL
//  The messages that fly over the WebSocket between the browser and the
//  Node server. Both sides import these types so they can never disagree.
// ============================================================================
import type { Kind, SessionEvent } from './events.ts';
import type { GitState } from './git.ts';
import type { CommandChoice, EffortLevel, ModelChoice, ThinkingChoice } from './models.ts';
import type { ProjectScan, ScanPatch } from './scan.ts';

/** "live" talks to the real Claude Code. "rehearsal" plays a scripted fake session. */
export type Mode = 'live' | 'rehearsal';

/** How much Claude may do without asking (a subset of the SDK's permission modes). */
export type PermissionModeName = 'default' | 'acceptEdits' | 'plan';

export interface QuestionOption {
  label: string;
  description?: string;
}
export interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

/** A "May I?" request waiting for the producer's answer. */
export interface PermissionRequest {
  requestId: string;
  toolId: string;
  tool: string;
  toolKind: Kind;
  summary: string;
  /** Raw tool input (long strings trimmed) so the popup can show details. */
  input: Record<string, unknown>;
  /** Short title from the SDK, e.g. "Claude wants to edit app.ts". */
  title?: string;
  description?: string;
  /** Set when Claude is asking the producer a multiple-choice question. */
  questions?: Question[];
  /** True if a "don't ask again" rule is available for this request. */
  canAlwaysAllow: boolean;
}

export interface SessionInfo {
  sessionId: string;
  title: string;
  lastModified: number;
  gitBranch?: string;
  /** "indulgent" = recorded by this app (full replay). "claude" = found in Claude Code's own history. */
  source: 'indulgent' | 'claude';
  cwd?: string;
}

export interface ServerState {
  cwd: string | null;
  mode: Mode;
  liveAvailable: boolean;
  /** Where Claude's credentials come from, once known (e.g. "ANTHROPIC_API_KEY"). */
  authSource?: string;
  permissionMode: PermissionModeName;
  /** The model you picked for your next message. null = "Default" (Claude Code's own choice). */
  model: string | null;
  /** The effort you picked. null = "Auto" (the model's own default). Always legal for `model`. */
  effort: EffortLevel | null;
  thinking: ThinkingChoice;
  /** The models you can choose from (Claude's real list in Live mode, the config list otherwise). */
  models: ModelChoice[];
  modelsSource: 'claude' | 'fallback';
  /** Claude Code's own slash commands and skills (for the "/" menu). */
  commands: CommandChoice[];
  sessionId: string | null;
  busy: boolean;
  recentProjects: string[];
}

// ---- server -> browser ------------------------------------------------------
export type ServerMsg =
  | { t: 'hello'; state: ServerState; events: SessionEvent[]; pending: PermissionRequest[]; sessions: SessionInfo[] }
  | { t: 'state'; state: ServerState }
  | { t: 'event'; event: SessionEvent }
  /** The whole log was replaced (a different session was opened). */
  | { t: 'events_reset'; events: SessionEvent[]; sessionId: string | null }
  /** Streaming text. Not stored in the log; the final text arrives as an event. */
  | { t: 'delta'; messageId: string; text: string }
  | { t: 'permission_request'; req: PermissionRequest }
  | { t: 'permission_cleared'; requestId: string }
  | { t: 'sessions'; sessions: SessionInfo[] }
  /** The whole project scan (sent when a project opens). */
  | { t: 'scan'; scan: ProjectScan | null }
  /** Incremental changes to the scan (files saved, analysis finished...). */
  | { t: 'scan_patch'; patch: ScanPatch }
  /** The project's git repository (null = no project). */
  | { t: 'git'; state: GitState | null }
  /** Streaming text for a side question. */
  | { t: 'side_delta'; id: string; text?: string; /** clear what was shown so far (Claude is going to use a tool first) */ reset?: boolean; /** a short progress line, e.g. "Reading src/app.ts" */ status?: string }
  | { t: 'side_end'; id: string; ok: boolean; error?: string; costUsd?: number }
  /** Output from a command you started in the Terminal panel. */
  | { t: 'term_data'; id: string; text: string }
  | { t: 'term_exit'; id: string; code: number | null; signal: string | null; ms: number }
  | { t: 'error'; message: string };

// ---- browser -> server ------------------------------------------------------
export type ClientMsg =
  | { t: 'send'; prompt: string }
  | { t: 'stop' }
  | {
      t: 'permission_reply';
      requestId: string;
      decision: 'allow' | 'allow_always' | 'deny';
      message?: string;
      /** For multiple-choice questions: question text -> chosen label(s). */
      answers?: Record<string, string>;
    }
  | { t: 'set_project'; cwd: string }
  | { t: 'new_session' }
  | { t: 'resume'; sessionId: string }
  | { t: 'set_mode'; mode: Mode }
  | { t: 'set_permission_mode'; mode: PermissionModeName }
  /** Pick the model for your next message (null or "default" = Claude Code's own choice). */
  | { t: 'set_model'; model: string | null }
  | { t: 'set_effort'; effort: EffortLevel | null }
  | { t: 'set_thinking'; thinking: ThinkingChoice }
  /** Ask Claude again which models are available. */
  | { t: 'refresh_models' }
  | { t: 'refresh_sessions' }
  /** Ask Claude a side question (explain a file/function, or sketch the architecture). Never touches your project. */
  | { t: 'side'; id: string; kind: SideKind; target?: SideTarget }
  | { t: 'side_cancel'; id: string }
  /** Run a shell command in the project (the Terminal panel). `id` is chosen by the browser. */
  | { t: 'term_run'; id: string; command: string }
  | { t: 'term_kill'; id: string };

export type SideKind = 'explain' | 'sketch';

/** What to explain: a whole file, or one function/class inside it. */
export interface SideTarget {
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
}

// ---- REST helpers -----------------------------------------------------------
export interface FsEntry {
  name: string;
  path: string;
  hasGit: boolean;
  isProject: boolean;
}
export interface FsListing {
  path: string;
  parent: string | null;
  home: string;
  entries: FsEntry[];
}
