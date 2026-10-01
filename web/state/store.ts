// ============================================================================
//  store.ts: the browser's copy of the server state.
//
//  The server owns the truth (project, session, event log, pending questions).
//  We mirror it here with zustand. The event log is applied to a mutable
//  `derived` view for speed, and components re-render at most every
//  `limits.uiThrottleMs` via the `rev` counter.
// ============================================================================
import { create } from 'zustand';
import { config } from '@config';
import type { SessionEvent } from '@shared/events';
import type { ClientMsg, PermissionRequest, ServerMsg, ServerState, SessionInfo } from '@shared/protocol';
import { applyEvent, computeDerived, emptyDerived, type Derived } from './derived';
import { useGit } from './git';
import { useScan } from './scan';
import { useSide } from './side';

export interface Toast {
  id: number;
  text: string;
  level: 'info' | 'error';
}

interface AppStore {
  conn: 'connecting' | 'open' | 'closed';
  server: ServerState | null;
  /** The event log of the current session (mutated in place; read it after `rev` changes). */
  events: SessionEvent[];
  /** What the screen shows right now (mutated in place, same rule). */
  derived: Derived;
  /** Bumped (throttled) whenever events/derived change. Subscribe to this to re-render. */
  rev: number;
  pending: PermissionRequest[];
  sessions: SessionInfo[];
  toasts: Toast[];
  dispatch: (msg: ServerMsg) => void;
  toast: (text: string, level?: Toast['level']) => void;
  dismissToast: (id: number) => void;
  setConn: (c: AppStore['conn']) => void;
}

// ---- throttled re-render ----------------------------------------------------
let timer: ReturnType<typeof setTimeout> | undefined;
let lastBump = 0;
function bump() {
  if (timer) return;
  const wait = Math.max(0, config.limits.uiThrottleMs - (performance.now() - lastBump));
  timer = setTimeout(() => {
    timer = undefined;
    lastBump = performance.now();
    useApp.setState((s) => ({ rev: s.rev + 1 }));
  }, wait);
}

let toastId = 1;

export const useApp = create<AppStore>((set, get) => ({
  conn: 'connecting',
  server: null,
  events: [],
  derived: emptyDerived(),
  rev: 0,
  pending: [],
  sessions: [],
  toasts: [],
  setConn: (conn) => set({ conn }),
  toast(text, level = 'info') {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, level }] }));
    setTimeout(() => get().dismissToast(id), 7000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  dispatch(msg) {
    switch (msg.t) {
      case 'hello':
        set({ server: msg.state, events: msg.events, derived: computeDerived(msg.events), pending: msg.pending, sessions: msg.sessions, rev: get().rev + 1 });
        return;
      case 'events_reset':
        // (a different session: any replay of the old one no longer makes sense)
        useView.setState({ replay: null });
        set({ events: msg.events, derived: computeDerived(msg.events), rev: get().rev + 1 });
        return;
      case 'event': {
        const { events, derived } = get();
        if (msg.event.seq < events.length) return; // already have it (guards against double delivery)
        events.push(msg.event);
        applyEvent(derived, msg.event);
        bump();
        return;
      }
      case 'delta': {
        const d = get().derived;
        d.live = { messageId: msg.messageId, text: (d.live?.messageId === msg.messageId ? d.live.text : '') + msg.text };
        if (d.busy) d.phase = 'thinking';
        bump();
        return;
      }
      case 'state':
        set({ server: msg.state });
        return;
      case 'permission_request':
        set((s) => ({ pending: [...s.pending.filter((p) => p.requestId !== msg.req.requestId), msg.req] }));
        return;
      case 'permission_cleared':
        set((s) => ({ pending: s.pending.filter((p) => p.requestId !== msg.requestId) }));
        return;
      case 'sessions':
        set({ sessions: msg.sessions });
        return;
      case 'scan':
        useScan.getState().setScan(msg.scan);
        return;
      case 'scan_patch':
        useScan.getState().applyPatch(msg.patch);
        return;
      case 'git':
        useGit.getState().apply(msg.state, !!get().server?.busy);
        return;
      case 'side_delta':
      case 'side_end':
        useSide.getState().apply(msg);
        return;
      case 'error':
        get().toast(msg.message, 'error');
        return;
    }
  },
}));

// ---- replay view ----------------------------------------------------------------
// When you scrub the replay slider, panels show an OLDER version of the session.
// Every panel reads through useDerived()/getView(), so they all follow automatically.
interface ViewStore {
  replay: { derived: Derived; /** time of the replayed moment */ now: number; /** events applied */ index: number } | null;
}
export const useView = create<ViewStore>(() => ({ replay: null }));

/** The replay "clock" (a time in the session's own timeline). Canvas panels read it every frame, so it isn't React state. */
export const replayClock = { now: 0 };

/** What panels should show: the live state, or the replayed moment. (For React components.) */
export function useDerived(): Derived {
  useApp((s) => s.rev);
  const replay = useView((s) => s.replay);
  return replay ? replay.derived : useApp.getState().derived;
}

/** Same thing for non-React code (canvas loops): the view data and the "clock" to fade glows against. */
export function getView(): { derived: Derived; now: number; replaying: boolean } {
  const r = useView.getState().replay;
  return { derived: r?.derived ?? useApp.getState().derived, now: r ? replayClock.now : Date.now(), replaying: !!r };
}

/** Call `fn` whenever the live data or the replay position changes. Returns an unsubscribe function. */
export function subscribeView(fn: () => void): () => void {
  const a = useApp.subscribe((s, p) => s.rev !== p.rev && fn());
  const b = useView.subscribe(fn);
  return () => (a(), b());
}

// ---- sending messages to the server --------------------------------------------
let socket: WebSocket | null = null;

export function send(msg: ClientMsg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else useApp.getState().toast('Not connected to the backend yet. Is `npm start` running?', 'error');
}

let started = false;

/** Open the WebSocket and keep it open (reconnects automatically). Safe to call twice. */
export function connect() {
  if (started) return;
  started = true;
  let retry = 0;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    socket = ws;
    useApp.getState().setConn('connecting');
    ws.onopen = () => {
      retry = 0;
      useApp.getState().setConn('open');
    };
    ws.onmessage = (ev) => {
      try {
        useApp.getState().dispatch(JSON.parse(ev.data));
      } catch (err) {
        console.error('bad message from server', err);
      }
    };
    ws.onclose = () => {
      useApp.getState().setConn('closed');
      setTimeout(open, Math.min(5000, 400 * 2 ** retry++));
    };
  };
  open();
}
