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
import { EFFORT_LEVELS, clampEffort, effortsFor, isDefaultModel, type EffortLevel, type ThinkingChoice } from '@shared/models';
import type { ClientMsg, Mode, PermissionModeName, PermissionRequest, Question, ServerMsg, ServerState, SessionInfo } from '@shared/protocol';
import { EventMapper } from './claude/eventMapper';
import { runLive } from './claude/live';
import { fetchLiveInfo } from './claude/models';
import { runRehearsal } from './claude/rehearsal';
import { describeTool, trimInput } from './claude/toolInfo';
import { runSide } from './claude/side';
import { ProjectService, type FsChangeKind } from './analysis/project';
import { GitService } from './git/gitService';
import { TerminalService } from './terminal';
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
    (msg) => {
      this.broadcast(msg);
      // a file was saved/added/removed (not just the background analysis): refresh the working-tree view
      if (msg.t === 'scan_patch' && msg.patch.progress === undefined) this.git.scheduleRefresh(600);
    },
    (rel, change) => this.onFsChange(rel, change),
  );
  /** Reads the project's git history and working-tree changes. */
  readonly git = new GitService((msg) => this.broadcast(msg));
  /** Runs the commands you type in the Terminal panel. */
  readonly terminal = new TerminalService((msg) => this.broadcast(msg));
  /** Remember each Bash command until its result arrives. */
  private bashCommands = new Map<string, string>();
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
    // The model / effort / thinking you picked last time (or the config's starting values).
    const models = config.models.fallback;
    const savedModel = typeof saved.model === 'string' ? saved.model : config.models.defaultModel;
    const model = isDefaultModel(savedModel) ? null : savedModel;
    const savedEffort = EFFORT_LEVELS.includes(saved.effort as EffortLevel) ? (saved.effort as EffortLevel) : config.models.defaultEffort;
    this.state = {
      cwd: lastProject,
      mode,
      liveAvailable,
      permissionMode: (saved.permissionMode as PermissionModeName) ?? 'default',
      model,
      effort: clampEffort(effortsFor(models, model), savedEffort),
      thinking: saved.thinking === 'off' ? 'off' : saved.thinking === 'auto' ? 'auto' : config.models.defaultThinking,
      models,
      modelsSource: 'fallback',
      commands: config.commands.fallback,
      sessionId: null,
      busy: false,
      recentProjects: Array.isArray(saved.recentProjects) ? (saved.recentProjects as string[]).filter((p) => fs.existsSync(p)) : [],
    };
    if (lastProject) {
      void this.project.open(lastProject);
      void this.git.open(lastProject);
      void this.loadModels();
      // Re-open the session you were in (so a restart or a crash doesn't lose your place).
      const last = typeof saved.lastSession === 'string' ? loadSession(saved.lastSession) : null;
      if (last && last.cwd === lastProject) {
        this.events = last.events;
        this.sessionKey = last.id;
        this.state.sessionId = last.id;
        this.sessionTitle = last.title;
        this.createdAt = last.createdAt;
        this.sessionIsRehearsal = last.rehearsal;
      }
    }
  }

  // ---- models, effort, thinking ------------------------------------------------
  private modelsLoading = false;

  /** In Live mode, ask Claude which models this account can use. (Rehearsal keeps the config list.) */
  async loadModels() {
    const cwd = this.state.cwd;
    if (this.state.mode !== 'live' || !this.state.liveAvailable || !cwd || this.modelsLoading) return;
    this.modelsLoading = true;
    try {
      const { models: list, commands } = await fetchLiveInfo(cwd);
      this.state.models = list;
      this.state.modelsSource = 'claude';
      this.state.commands = commands;
      // Your saved choice might not exist on this account any more: fall back to Default instead of failing every message.
      if (this.state.model && !list.some((m) => m.value === this.state.model)) this.state.model = null;
      this.state.effort = clampEffort(effortsFor(list, this.state.model), this.state.effort);
      saveSettings({ model: this.state.model, effort: this.state.effort });
    } catch {
      // Not logged in yet, or Claude did not answer: keep showing the config list.
      this.state.models = config.models.fallback;
      this.state.modelsSource = 'fallback';
      this.state.commands = config.commands.fallback;
    } finally {
      this.modelsLoading = false;
      this.pushState();
    }
  }

  private setModel(model: string | null) {
    this.state.model = isDefaultModel(model) ? null : model;
    // A model that does not accept your effort level gets the closest one it does accept.
    this.state.effort = clampEffort(effortsFor(this.state.models, this.state.model), this.state.effort);
    saveSettings({ model: this.state.model, effort: this.state.effort });
    this.pushState();
  }

  private setEffort(effort: EffortLevel | null) {
    this.state.effort = clampEffort(effortsFor(this.state.models, this.state.model), effort);
    saveSettings({ effort: this.state.effort });
    this.pushState();
  }

  private setThinking(thinking: ThinkingChoice) {
    this.state.thinking = thinking === 'off' ? 'off' : 'auto';
    saveSettings({ thinking: this.state.thinking });
    this.pushState();
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
    if (this.git.state) this.send(ws, { t: 'git', state: this.git.state });
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
        // Rehearsal shows the config list; Live asks Claude for the real one.
        if (msg.mode === 'rehearsal') {
          this.state.models = config.models.fallback;
          this.state.modelsSource = 'fallback';
          this.state.commands = config.commands.fallback;
        } else void this.loadModels();
        return this.pushState();
      case 'set_permission_mode':
        this.state.permissionMode = msg.mode;
        saveSettings({ permissionMode: msg.mode });
        return this.pushState();
      case 'set_model':
        return this.setModel(msg.model);
      case 'set_effort':
        return this.setEffort(msg.effort);
      case 'set_thinking':
        return this.setThinking(msg.thinking);
      case 'refresh_models':
        return this.loadModels();
      case 'refresh_sessions':
        return this.refreshSessions();
      case 'side':
        return this.startSide(msg.id, msg.kind, msg.target);
      case 'side_cancel':
        this.sides.get(msg.id)?.abort();
        return;
      case 'term_run':
        if (!this.state.cwd) return this.fail('Pick a project first.');
        return this.terminal.run(String(msg.id), String(msg.command), this.state.cwd);
      case 'term_kill':
        return this.terminal.kill(String(msg.id));
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
    this.afterEvent(ev);
    for (const l of this.eventListeners) l(ev);
    this.schedulePersist();
  };

  /** Side effects of events: keep the git view fresh after commands, and play pretend commits in rehearsal. */
  private afterEvent(ev: SessionEvent) {
    if (ev.kind === 'tool_start' && ev.tool === 'Bash' && typeof ev.input.command === 'string') this.bashCommands.set(ev.toolId, ev.input.command);
    if (ev.kind === 'tool_end') {
      const cmd = this.bashCommands.get(ev.toolId);
      this.bashCommands.delete(ev.toolId);
      if (cmd && /\bgit\b/.test(cmd)) {
        if (this.state.mode === 'rehearsal' && /git\s+commit/.test(cmd) && ev.ok) {
          const m = /-m\s+(?:"([^"]*)"|'([^']*)')/.exec(cmd);
          this.git.addVirtualCommit(m?.[1] ?? m?.[2] ?? 'Rehearsal commit');
        } else this.git.scheduleRefresh();
      }
    }
    if (ev.kind === 'turn_end') this.git.scheduleRefresh();
  }

  private resetLog(events: SessionEvent[], sessionKey: string | null) {
    this.events = events;
    saveSettings({ lastSession: sessionKey });
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
    this.terminal.killAll();
    this.persist();
  }

  private persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.sessionKey || !this.state.cwd || this.events.length === 0) return;
    saveSettings({ lastSession: this.sessionKey });
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
    this.terminal.killAll(); // commands started in the old project should not keep running
    this.state.cwd = abs;
    this.state.recentProjects = [abs, ...this.state.recentProjects.filter((p) => p !== abs)].slice(0, 8);
    saveSettings({ lastProject: abs, recentProjects: this.state.recentProjects });
    this.resetLog([], null);
    this.sessionTitle = '';
    void this.project.open(abs);
    void this.git.open(abs);
    void this.loadModels(); // the list can differ per project (its own settings files can narrow it)
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
        void this.git.open(stored.cwd);
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
        await runRehearsal({ cwd, prompt, sessionId: this.sessionKey!, signal: abort.signal, permissionMode: this.state.permissionMode, model: this.state.model, effort: this.state.effort, thinking: this.state.thinking, canUseTool, push });
      } else {
        await runLive({
          cwd,
          prompt,
          resumeId: this.sessionKey,
          permissionMode: this.state.permissionMode,
          model: this.state.model,
          effort: this.state.effort,
          thinking: this.state.thinking,
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
