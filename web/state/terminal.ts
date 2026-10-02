// ============================================================================
//  terminal.ts: the commands YOU ran in the Terminal panel (Claude's own
//  commands come from the session log instead). The server streams their output
//  back as "term_data" / "term_exit" messages (see store.ts).
// ============================================================================
import { create } from 'zustand';

export interface TermRun {
  id: string;
  command: string;
  startedAt: number;
  output: string;
  running: boolean;
  code?: number | null;
  signal?: string | null;
  ms?: number;
}

/** Keep at most this much output per command in the browser. */
const MAX_CHARS = 300_000;

interface TermStore {
  runs: TermRun[];
  /** Commands you typed, newest last (for the up/down arrows). */
  history: string[];
  add: (run: TermRun) => void;
  append: (id: string, text: string) => void;
  exit: (id: string, code: number | null, signal: string | null, ms: number) => void;
  clear: () => void;
}

export const useTerm = create<TermStore>((set) => ({
  runs: [],
  history: [],
  add: (run) => set((s) => ({ runs: [...s.runs.slice(-49), run], history: s.history[s.history.length - 1] === run.command ? s.history : [...s.history.slice(-99), run.command] })),
  append: (id, text) =>
    set((s) => ({
      runs: s.runs.map((r) => {
        if (r.id !== id) return r;
        const output = r.output + text;
        return { ...r, output: output.length > MAX_CHARS ? output.slice(-MAX_CHARS) : output };
      }),
    })),
  exit: (id, code, signal, ms) => set((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, running: false, code, signal, ms } : r)) })),
  // only finished commands are cleared; a running one stays so you can still stop it
  clear: () => set((s) => ({ runs: s.runs.filter((r) => r.running) })),
}));
