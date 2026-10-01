// ============================================================================
//  side.ts: "side questions" you ask Claude about your code (explain a file or
//  function, sketch the architecture). Answers stream in and are kept here.
// ============================================================================
import { create } from 'zustand';
import type { ClientMsg, ServerMsg, SideKind, SideTarget } from '@shared/protocol';

type Sender = (m: ClientMsg) => void;

export interface SideTask {
  id: string;
  kind: SideKind;
  title: string;
  target?: SideTarget;
  text: string;
  /** Progress line while Claude is reading ("Read: src/app.ts"). */
  status: string;
  state: 'running' | 'done' | 'error';
  error?: string;
  costUsd?: number;
  startedAt: number;
}

interface SideStore {
  tasks: SideTask[];
  /** The explanation shown in Liner Notes / the sketch shown in Floor Plan. */
  currentExplain: string | null;
  currentSketch: string | null;
  start: (task: Omit<SideTask, 'text' | 'status' | 'state' | 'startedAt'>) => void;
  apply: (msg: Extract<ServerMsg, { t: 'side_delta' | 'side_end' }>) => void;
}

export const useSide = create<SideStore>((set) => ({
  tasks: [],
  currentExplain: null,
  currentSketch: null,
  start(task) {
    const full: SideTask = { ...task, text: '', status: 'Starting…', state: 'running', startedAt: Date.now() };
    set((s) => ({
      tasks: [...s.tasks.filter((t) => t.id !== task.id).slice(-40), full],
      currentExplain: task.kind === 'explain' ? task.id : s.currentExplain,
      currentSketch: task.kind === 'sketch' ? task.id : s.currentSketch,
    }));
  },
  apply(msg) {
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== msg.id) return t;
        if (msg.t === 'side_delta') return { ...t, text: msg.reset ? '' : t.text + (msg.text ?? ''), status: msg.status ?? t.status };
        return { ...t, state: msg.ok ? 'done' : 'error', error: msg.error, costUsd: msg.costUsd, status: '' };
      }),
    }));
  },
}));

const keyOf = (kind: SideKind, t?: SideTarget) => `${kind}:${t?.path ?? ''}:${t?.symbol ?? ''}`;

/** Ask Claude to explain a file or function. Re-uses a finished answer for the same target. */
export function askExplain(send: Sender, target: SideTarget, force = false) {
  const store = useSide.getState();
  const key = keyOf('explain', target);
  const existing = [...store.tasks].reverse().find((t) => keyOf(t.kind, t.target) === key && t.state !== 'error');
  if (existing && !force) return useSide.setState({ currentExplain: existing.id });
  const id = `${key}@${Date.now()}`;
  store.start({ id, kind: 'explain', title: target.symbol ? `${target.symbol}()` : target.path, target });
  send({ t: 'side', id, kind: 'explain', target });
}

export function askSketch(send: Sender) {
  const id = `sketch@${Date.now()}`;
  useSide.getState().start({ id, kind: 'sketch', title: 'Architecture sketch' });
  send({ t: 'side', id, kind: 'sketch' });
}

export function cancelSide(send: Sender, id: string) {
  send({ t: 'side_cancel', id });
}
