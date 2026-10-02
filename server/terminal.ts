// ============================================================================
//  terminal.ts: run a shell command in the project and stream its output.
//
//  This is a "command runner", not a full interactive terminal: each command runs
//  to completion (programs that wait for keyboard input just see an empty input).
//  That is enough for tests, builds, git, npm... and it needs no native add-ons.
//
//  SAFETY: only your own browser tab (checked by server/index.ts: localhost only)
//  can start commands. They run with YOUR permissions, exactly as if you typed
//  them in a terminal in the project folder.
// ============================================================================
import { spawn, type ChildProcess } from 'node:child_process';
import type { ServerMsg } from '@shared/protocol';

/** Output beyond this many characters per command is dropped (a runaway `yes` should not eat memory). */
const MAX_OUTPUT_CHARS = 1_000_000;

interface Running {
  child: ChildProcess;
  sent: number;
  started: number;
  truncated: boolean;
}

export class TerminalService {
  private running = new Map<string, Running>();

  constructor(private broadcast: (msg: ServerMsg) => void) {}

  run(id: string, command: string, cwd: string) {
    if (this.running.has(id)) return;
    const win = process.platform === 'win32';
    const shell = win ? (process.env.ComSpec ?? 'cmd.exe') : (process.env.SHELL ?? '/bin/bash');
    const args = win ? ['/d', '/s', '/c', command] : ['-c', command];
    const child = spawn(shell, args, {
      cwd,
      // FORCE_COLOR makes most tools print colors even though they are not on a real terminal.
      env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so Stop can end the command AND everything it started.
      detached: !win,
    });
    const state: Running = { child, sent: 0, started: Date.now(), truncated: false };
    this.running.set(id, state);

    const forward = (chunk: Buffer) => {
      if (state.truncated) return;
      let text = chunk.toString('utf8');
      if (state.sent + text.length > MAX_OUTPUT_CHARS) {
        text = text.slice(0, Math.max(0, MAX_OUTPUT_CHARS - state.sent)) + '\n[output cut off: too long]\n';
        state.truncated = true;
      }
      state.sent += text.length;
      this.broadcast({ t: 'term_data', id, text });
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);

    let finished = false;
    const finish = (code: number | null, signal: string | null) => {
      if (finished) return;
      finished = true;
      this.running.delete(id);
      this.broadcast({ t: 'term_exit', id, code, signal, ms: Date.now() - state.started });
    };
    child.on('error', (err) => {
      forward(Buffer.from(`could not start: ${err.message}\n`));
      finish(127, null);
    });
    child.on('close', finish);
  }

  /** Stop a command: a polite SIGTERM first, SIGKILL if it is still alive 3 seconds later. */
  kill(id: string) {
    const r = this.running.get(id);
    if (!r?.child.pid) return;
    const signalGroup = (sig: NodeJS.Signals) => {
      try {
        // a negative pid = the whole process group (Linux and macOS)
        process.kill(process.platform === 'win32' ? r.child.pid! : -r.child.pid!, sig);
      } catch {
        /* already gone */
      }
    };
    signalGroup('SIGTERM');
    setTimeout(() => this.running.has(id) && signalGroup('SIGKILL'), 3000).unref();
  }

  killAll() {
    for (const id of [...this.running.keys()]) this.kill(id);
  }
}
