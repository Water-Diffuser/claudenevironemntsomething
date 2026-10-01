// ============================================================================
//  runtime.ts: the brain of the server.
//
//  It owns the current project, the current session's event log, the running
//  Claude turn, and any "May I?" questions waiting for you. Every connected
//  browser tab just mirrors this state over the WebSocket.
// ============================================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type WebSocket from 'ws';
import { getSessionMessages, listSessions, type CanUseTool, type PermissionResult, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '@config';
import type { SessionEvent, SessionEventBody } from '@shared/events';
import type { ClientMsg, Mode, PermissionModeName, PermissionRequest, Question, ServerMsg, ServerState, SessionInfo } from '@shared/protocol';
import { EventMapper } from './claude/eventMapper';
import { runLive } from './claude/live';
import { runRehearsal } from './claude/rehearsal';
import { describeTool, trimInput } from './claude/toolInfo';
import { runSide } from './claude/side';
import { ProjectService, type FsChangeKind } from './analysis/project';
import { deleteSessionFile, listStoredSessions, loadSession, loadSettings, saveSession, saveSettings } from './store/jsonStore';

interface PendingPermission {
  req: PermissionRequest;
  input: Record<string, unknown>;
  suggestions?: unknown[];
  resolve: (r: PermissionResult) => void;
  askedAt: number;
}

/** Can we plausibly talk to real Claude? (An API key, or a previous Claude Code login.) */
function detectLiveAvailable(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) return true;
  const home = os.homedir();
  return fs.existsSync(path.join(home, '.claude')) || fs.existsSync(path.join(home, '.claude.json'));
}

export class Runtime {
  private clients = new Set<WebSocket>();
  private events: SessionEvent[] = [];
  private pending = new Map<string, PendingPermission>();
  private sessions: SessionInfo[] = [];

  /** Id this session is stored under (the real Claude session id once known). */
  private sessionKey: string | null = null;
  private sessionIsRehearsal = false;
  private sessionTitle = '';
  private createdAt = Date.now();
  private persistTimer: NodeJS.Timeout | null = null;

  private abort: AbortController | null = null;
  private query: Query | null = null;
  private stopRequested = false;

  /** Scans the open project and watches it for changes. */
  readonly project = new ProjectService(
    (msg) => this.broadcast(msg),
    (rel, change) => this.onFsChange(rel, change),
  );
  /** Files Claude's own tools touched recently (so the watcher doesn't double-report them). */
  private recentToolPaths = new Map<string, number>();
  private toolPathsById = new Map<string, string[]>();
  /** Other parts of the server can listen to every event (e.g. to react to Claude's tool calls). */
  eventListeners: Array<(ev: SessionEvent) => void> = [];

  state: ServerState;

  constructor() {
    const saved = loadSettings();
    const liveAvailable = detectLiveAvailable();
    const forced = process.env.INDULGENT_MODE as Mode | undefined;
    const wanted = (forced ?? (saved.mode as Mode | undefined) ?? config.app.defaultMode) as Mode | 'auto';
    const mode: Mode = wanted === 'auto' ? (liveAvailable ? 'live' : 'rehearsal') : wanted;
    const lastProject = typeof saved.lastProject === 'string' && fs.existsSync(saved.lastProject) ? saved.lastProject : null;
    this.state = {
      cwd: lastProject,
      mode,
      liveAvailable,
      permissionMode: (saved.permissionMode as PermissionModeName) ?? 'default',
      sessionId: null,
      busy: false,
      recentProjects: Array.isArray(saved.recentProjects) ? (saved.recentProjects as string[]).filter((p) => fs.existsSync(p)) : [],
    };
    if (lastProject) void this.project.open(lastProject);
  }

  // ---- connections ----------------------------------------------------------
  addClient(ws: WebSocket) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      this.handle(msg).catch((e) => this.send(ws, { t: 'error', message: String(e?.message ?? e) }));
    });
    this.send(ws, { t: 'hello', state: this.state, events: this.events, pending: [...this.pending.values()].map((p) => p.req), sessions: this.sessions });
    if (this.project.scan) this.send(ws, { t: 'scan', scan: this.project.scan });
    void this.refreshSessions();
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
  private broadcast(msg: ServerMsg) {
    const text = JSON.stringify(msg);
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(text);
  }
  private pushState() {
    this.broadcast({ t: 'state', state: this.state });
  }

  // ---- messages from the browser -------------------------------------------
  private async handle(msg: ClientMsg) {
    switch (msg.t) {
      case 'send':
        return this.sendPrompt(msg.prompt);
      case 'stop':
        return this.stop();
      case 'permission_reply':
        return this.answerPermission(msg.requestId, msg.decision, msg.message, msg.answers);
      case 'set_project':
        return this.setProject(msg.cwd);
      case 'new_session':
        return this.newSession();
      case 'resume':
        return this.resume(msg.sessionId);
      case 'set_mode':
        if (this.state.busy) return this.fail('Wait for the current take to finish (or press Stop) before switching modes.');
        this.state.mode = msg.mode;
        saveSettings({ mode: msg.mode });
        return this.pushState();
      case 'set_permission_mode':
        this.state.permissionMode = msg.mode;
        saveSettings({ permissionMode: msg.mode });
        return this.pushState();
      case 'refresh_sessions':
        return this.refreshSessions();
      case 'side':
        return this.startSide(msg.id, msg.kind, msg.target);
      case 'side_cancel':
        this.sides.get(msg.id)?.abort();
        return;
    }
  }

  // ---- side questions (explain / sketch) --------------------------------------------
  private sides = new Map<string, AbortController>();

  private async startSide(id: string, kind: 'explain' | 'sketch', target?: { path: string; symbol?: string; startLine?: number; endLine?: number }) {
    const cwd = this.state.cwd;
    if (!cwd) return this.fail('Pick a project first.');
    if (kind === 'explain' && !target) return this.fail('Nothing to explain.');
    this.sides.get(id)?.abort();
    const abort = new AbortController();
    this.sides.set(id, abort);
    try {
      const { costUsd } = await runSide(
        { kind, target, cwd, rehearsal: this.state.mode === 'rehearsal', project: this.project, signal: abort.signal },
        {
          text: (text) => this.broadcast({ t: 'side_delta', id, text }),
          reset: () => this.broadcast({ t: 'side_delta', id, reset: true }),
          status: (status) => this.broadcast({ t: 'side_delta', id, status }),
        },
      );
      this.broadcast({ t: 'side_end', id, ok: true, costUsd });
    } catch (err: any) {
      const aborted = abort.signal.aborted || err?.name === 'AbortError';
      this.broadcast({ t: 'side_end', id, ok: false, error: aborted ? 'cancelled' : friendlyError(err) });
    } finally {
      this.sides.delete(id);
    }
  }

  private fail(message: string) {
    this.broadcast({ t: 'error', message });
  }

  // ---- the event log --------------------------------------------------------
  emit = (body: SessionEventBody) => {
    const ev = { ...body, seq: this.events.length, ts: Date.now() } as SessionEvent;
    this.events.push(ev);
    this.broadcast({ t: 'event', event: ev });
    // Remember files Claude's own edit/create/delete tools touched, so the file watcher doesn't report them twice.
    if (ev.kind === 'tool_start' && (ev.toolKind === 'edit' || ev.toolKind === 'create' || ev.toolKind === 'delete')) for (const p of ev.paths) this.recentToolPaths.set(p, ev.ts);
    if (ev.kind === 'tool_end') for (const p of this.toolPathsById.get(ev.toolId) ?? []) this.recentToolPaths.set(p, ev.ts);
    if (ev.kind === 'tool_start') this.toolPathsById.set(ev.toolId, ev.toolKind === 'edit' || ev.toolKind === 'create' || ev.toolKind === 'delete' ? ev.paths : []);
    for (const l of this.eventListeners) l(ev);
    this.schedulePersist();
  };

  private resetLog(events: SessionEvent[], sessionKey: string | null) {
    this.events = events;
    this.sessionKey = sessionKey;
    this.state.sessionId = sessionKey;
    this.broadcast({ t: 'events_reset', events, sessionId: sessionKey });
    this.pushState();
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => this.persist(), 500);
  }

  /** Save the current session right now (called on shutdown). */
  flush() {
    this.persist();
  }

  private persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.sessionKey || !this.state.cwd || this.events.length === 0) return;
    saveSession({
      id: this.sessionKey,
      title: this.sessionTitle || 'Untitled take',
      cwd: this.state.cwd,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      rehearsal: this.sessionIsRehearsal,
      events: this.events,
    });
  }

  /** The file watcher saw a change. If Claude is working and none of its tools explains it (e.g. a shell command did it), log it. */
  private onFsChange(rel: string, change: FsChangeKind) {
    if (!this.state.busy) return;
    const t = this.recentToolPaths.get(rel);
    if (t && Date.now() - t < 5000) return;
    this.emit({ kind: 'fs_change', path: rel, change });
  }

  // ---- projects -------------------------------------------------------------
  async setProject(cwd: string) {
    if (this.state.busy) return this.fail('Press Stop (or wait) before changing project.');
    const abs = path.resolve(cwd);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return this.fail(`That folder does not exist: ${abs}`);
    this.persist();
    this.state.cwd = abs;
    this.state.recentProjects = [abs, ...this.state.recentProjects.filter((p) => p !== abs)].slice(0, 8);
    saveSettings({ lastProject: abs, recentProjects: this.state.recentProjects });
    this.resetLog([], null);
    this.sessionTitle = '';
    void this.project.open(abs);
    await this.refreshSessions();
  }

  // ---- sessions (the Setlist) ----------------------------------------------
  async newSession() {
    if (this.state.busy) return this.fail('Press Stop (or wait) before starting a new take.');
    this.persist();
    this.sessionTitle = '';
    this.createdAt = Date.now();
    this.resetLog([], null);
    await this.refreshSessions();
  }

  async refreshSessions() {
    const cwd = this.state.cwd;
    const list = new Map<string, SessionInfo>();
    // 1. Sessions this app recorded (these have a full replayable log).
    for (const s of listStoredSessions(cwd)) {
      list.set(s.id, { sessionId: s.id, title: s.title, lastModified: s.updatedAt, gitBranch: s.gitBranch, source: 'indulgent', cwd: s.cwd });
    }
    // 2. Sessions found in Claude Code's own history for this folder.
    if (cwd) {
      try {
        for (const s of await listSessions({ dir: cwd, limit: 40 })) {
          if (!list.has(s.sessionId)) {
            list.set(s.sessionId, {
              sessionId: s.sessionId,
              title: s.customTitle || s.summary || s.firstPrompt || 'Untitled take',
              lastModified: s.lastModified,
              gitBranch: s.gitBranch,
              source: 'claude',
              cwd: s.cwd,
            });
          }
        }
      } catch {
        /* Claude's history folder may not exist yet. That's fine. */
      }
    }
    this.sessions = [...list.values()].sort((a, b) => b.lastModified - a.lastModified);
    this.broadcast({ t: 'sessions', sessions: this.sessions });
  }

  async resume(id: string) {
    if (this.state.busy) return this.fail('Press Stop (or wait) before opening another take.');
    this.persist();
    const stored = loadSession(id);
    if (stored) {
      this.sessionTitle = stored.title;
      this.createdAt = stored.createdAt;
      this.sessionIsRehearsal = stored.rehearsal;
      // Re-open in the project the session was recorded in.
      if (stored.cwd !== this.state.cwd && fs.existsSync(stored.cwd)) {
        this.state.cwd = stored.cwd;
        saveSettings({ lastProject: stored.cwd });
        void this.project.open(stored.cwd);
      }
      this.resetLog(stored.events, stored.id);
      return;
    }
    // Not recorded by us: rebuild an event log from Claude Code's own transcript.
    const cwd = this.state.cwd;
    if (!cwd) return this.fail('Pick a project first.');
    const msgs = await getSessionMessages(id, { dir: cwd });
    const rebuilt: SessionEvent[] = [];
    const base = Date.now() - msgs.length * 600;
    const mapper = new EventMapper(
      cwd,
      {
        emit: (b) => rebuilt.push({ ...b, seq: rebuilt.length, ts: base + rebuilt.length * 600 } as SessionEvent),
        delta: () => {},
        onInit: () => {},
      },
      true,
    );
    for (const m of msgs) mapper.handle(m as unknown as SDKMessage);
    rebuilt.unshift({ kind: 'session_start', sessionId: id, cwd, rehearsal: false, seq: 0, ts: base } as SessionEvent);
    rebuilt.forEach((e, i) => (e.seq = i));
    this.sessionIsRehearsal = false;
    this.sessionTitle = this.sessions.find((s) => s.sessionId === id)?.title ?? 'Imported take';
    this.createdAt = Date.now();
    this.resetLog(rebuilt, id);
  }

  // ---- running a turn -------------------------------------------------------
  async sendPrompt(prompt: string) {
    prompt = prompt.trim();
    if (!prompt) return;
    if (this.state.busy) return this.fail('Claude is still working. Press Stop first.');
    const cwd = this.state.cwd;
    if (!cwd) return this.fail('Pick a project folder first (top left).');
    const rehearsal = this.state.mode === 'rehearsal';

    // A rehearsal take can't be continued with real Claude (and vice versa): start a fresh one.
    if (this.sessionKey && this.sessionIsRehearsal !== rehearsal) {
      this.persist();
      this.resetLog([], null);
      this.sessionTitle = '';
      this.createdAt = Date.now();
    }
    this.sessionIsRehearsal = rehearsal;
    if (!this.sessionTitle) this.sessionTitle = prompt.slice(0, 70);
    // Rehearsal sessions get a made-up id immediately; real ones learn theirs from the SDK.
    if (rehearsal && !this.sessionKey) {
      this.sessionKey = `rehearsal-${crypto.randomUUID()}`;
      this.state.sessionId = this.sessionKey;
      this.emit({ kind: 'session_start', sessionId: this.sessionKey, cwd, rehearsal: true });
    }

    this.state.busy = true;
    this.stopRequested = false;
    this.pushState();
    this.emit({ kind: 'user_message', text: prompt });

    const abort = new AbortController();
    this.abort = abort;
    const mapper = new EventMapper(cwd, {
      emit: (body) => {
        // After Stop, the SDK ends the turn with an "error" result. Don't show that as a failure.
        if (this.stopRequested && body.kind === 'turn_end') body = { ...body, error: undefined };
        this.emit(body);
      },
      delta: (messageId, text) => this.broadcast({ t: 'delta', messageId, text }),
      onInit: (info) => this.onInit(info, cwd, rehearsal),
    });
    this.mapper = mapper;

    const canUseTool: CanUseTool = (tool, input, opts) => this.askPermission(tool, input, opts, cwd);
    const push = (m: SDKMessage) => mapper.handle(m);

    try {
      if (rehearsal) {
        await runRehearsal({ cwd, prompt, sessionId: this.sessionKey!, signal: abort.signal, permissionMode: this.state.permissionMode, canUseTool, push });
      } else {
        await runLive({
          cwd,
          prompt,
          resumeId: this.sessionKey,
          permissionMode: this.state.permissionMode,
          abort,
          canUseTool,
          onQuery: (q) => (this.query = q),
          push,
        });
      }
    } catch (err: any) {
      if (!this.stopRequested && err?.name !== 'AbortError') {
        this.emit({ kind: 'notice', level: 'error', text: friendlyError(err) });
        this.emit({ kind: 'turn_end', ok: false, costUsd: 0, durationMs: 0, turns: 0, error: String(err?.message ?? err) });
      }
    } finally {
      if (this.stopRequested) this.emit({ kind: 'interrupted' });
      this.clearAllPending('Take ended.');
      this.abort = null;
      this.query = null;
      this.mapper = null;
      this.state.busy = false;
      this.pushState();
      this.persist();
      void this.refreshSessions();
    }
  }

  private mapper: EventMapper | null = null;

  private onInit(info: { sessionId: string; model?: string; authSource?: string }, cwd: string, rehearsal: boolean) {
    if (info.authSource) this.state.authSource = info.authSource;
    if (rehearsal) return; // rehearsal already announced its session
    const changed = this.sessionKey !== info.sessionId;
    if (changed) {
      // Real Claude just told us its session id. Adopt it (and drop any temp file we saved under another id).
      const old = this.sessionKey;
      this.sessionKey = info.sessionId;
      this.state.sessionId = info.sessionId;
      if (old && old !== info.sessionId) deleteSessionFile(old);
      this.emit({ kind: 'session_start', sessionId: info.sessionId, cwd, model: info.model, rehearsal: false, authSource: info.authSource });
    }
    this.pushState();
  }

  async stop() {
    if (!this.state.busy) return;
    this.stopRequested = true;
    this.clearAllPending('Stopped by the producer.', true);
    const abort = this.abort;
    // Real Claude: ask nicely first (interrupt), and pull the plug if it doesn't stop within 4 seconds.
    if (this.query) {
      const q = this.query;
      const hardStop = setTimeout(() => abort?.abort(), 4000);
      try {
        await q.interrupt();
      } catch {
        abort?.abort();
      } finally {
        clearTimeout(hardStop);
      }
    } else {
      abort?.abort();
    }
  }

  // ---- "May I?" ---------------------------------------------------------------
  private askPermission(tool: string, input: Record<string, unknown>, opts: Parameters<CanUseTool>[2], cwd: string): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const d = describeTool(tool, input, cwd);
      const requestId = opts.requestId ?? crypto.randomUUID();
      const toolId = opts.toolUseID;

      // Claude asking the producer a multiple-choice question.
      let questions: Question[] | undefined;
      if (tool === 'AskUserQuestion' && Array.isArray((input as any).questions)) {
        questions = (input as any).questions.map((q: any) => ({
          question: String(q.question ?? ''),
          header: q.header,
          multiSelect: !!q.multiSelect,
          options: (q.options ?? []).map((o: any) => ({ label: String(o.label ?? ''), description: o.description })),
        }));
      }

      const req: PermissionRequest = {
        requestId,
        toolId,
        tool,
        toolKind: d.kind,
        summary: d.summary,
        input: trimInput(input),
        title: opts.title,
        description: opts.description,
        questions,
        canAlwaysAllow: !!opts.suggestions?.length,
      };
      this.pending.set(requestId, { req, input, suggestions: opts.suggestions, resolve, askedAt: Date.now() });
      this.broadcast({ t: 'permission_request', req });
      this.emit({ kind: 'permission', requestId, toolId, tool, decision: 'asked' });
      opts.signal?.addEventListener('abort', () => this.dropPending(requestId, { behavior: 'deny', message: 'Interrupted.' }), { once: true });
    });
  }

  private dropPending(requestId: string, result: PermissionResult) {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    this.broadcast({ t: 'permission_cleared', requestId });
    p.resolve(result);
  }

  private clearAllPending(message: string, interrupt = false) {
    for (const id of [...this.pending.keys()]) this.dropPending(id, { behavior: 'deny', message, interrupt });
  }

  private answerPermission(requestId: string, decision: 'allow' | 'allow_always' | 'deny', message?: string, answers?: Record<string, string>) {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.mapper?.addWait(p.req.toolId, Date.now() - p.askedAt);
    this.emit({ kind: 'permission', requestId, toolId: p.req.toolId, tool: p.req.tool, decision: decision === 'deny' ? 'denied' : 'allowed' });
    if (decision === 'deny') {
      return this.dropPending(requestId, { behavior: 'deny', message: message || 'The producer said no. Do not retry this; ask what they would like instead.' });
    }
    const updatedInput = answers ? { ...p.input, answers } : p.input;
    const result: PermissionResult = { behavior: 'allow', updatedInput };
    if (decision === 'allow_always' && p.suggestions?.length) (result as any).updatedPermissions = p.suggestions;
    this.dropPending(requestId, result);
  }
}

function friendlyError(err: any): string {
  const text = String(err?.message ?? err);
  if (/api key|authentication|401|login|credential/i.test(text)) {
    return 'Claude could not log in. Put your key in the .env file (ANTHROPIC_API_KEY=sk-ant-...) and restart, or switch to Rehearsal mode at the top. (' + text.slice(0, 160) + ')';
  }
  if (/ENOENT|spawn/i.test(text)) return 'Could not start Claude Code. Try `npm install` again. (' + text.slice(0, 160) + ')';
  return text;
}
