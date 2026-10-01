// ============================================================================
//  replay.ts: the session replay engine.
//
//  Everything on screen is computed from the event log. Replay just feeds the
//  SAME reducers a PARTIAL log (the first `index` events) and tells every panel
//  to show that instead of the live state (via useView in store.ts).
//   * scrubbing   -> rebuild the view from scratch at the chosen step
//   * playing     -> apply events one by one as the clock advances (fast)
// ============================================================================
import { create } from 'zustand';
import type { SessionEvent } from '@shared/events';
import { applyEvent, computeDerived } from './derived';
import { replayClock, useApp, useView } from './store';

interface ReplayStore {
  /** Are we looking at the past (true) or the live state (false)? */
  active: boolean;
  /** How many events have been applied. */
  index: number;
  playing: boolean;
  speed: number;
  /** Squash long pauses (waiting for you, thinking...) so playback moves along. */
  skipIdle: boolean;
}

export const useReplay = create<ReplayStore>(() => ({ active: false, index: 0, playing: false, speed: 1, skipIdle: true }));

/** Events that change what you see (the others, like token counts, are skipped when stepping). */
export function isMeaningful(e: SessionEvent): boolean {
  return e.kind === 'user_message' || e.kind === 'assistant_text' || e.kind === 'tool_start' || e.kind === 'tool_end' || e.kind === 'turn_end' || e.kind === 'notice' || e.kind === 'interrupted' || e.kind === 'fs_change';
}

// ---- the timeline ---------------------------------------------------------------------------------
let timeline: number[] = []; // timeline[i] = playback time (ms) at which event i is applied
let timelineFor = { events: null as SessionEvent[] | null, count: -1, skipIdle: true };

function ensureTimeline(events: SessionEvent[], skipIdle: boolean) {
  if (timelineFor.events === events && timelineFor.count === events.length && timelineFor.skipIdle === skipIdle) return;
  const cap = skipIdle ? 900 : 12_000;
  timeline = new Array(events.length);
  let t = 0;
  for (let i = 0; i < events.length; i++) {
    if (i > 0) t += Math.min(cap, Math.max(0, events[i].ts - events[i - 1].ts));
    timeline[i] = t;
  }
  timelineFor = { events, count: events.length, skipIdle };
}

const clockAt = (events: SessionEvent[], index: number) => (index > 0 ? events[index - 1].ts : (events[0]?.ts ?? Date.now()));

function publish(derived: ReturnType<typeof computeDerived>, index: number, events: SessionEvent[]) {
  replayClock.now = clockAt(events, index);
  useView.setState({ replay: { derived, now: replayClock.now, index } });
  useReplay.setState({ active: true, index });
}

// ---- controls ---------------------------------------------------------------------------------------
let raf = 0;
let startWall = 0;
let startElapsed = 0;
let lastNotify = 0;

/** Show the session as it was after the first `index` events. */
export function seek(index: number) {
  const events = useApp.getState().events;
  const i = Math.max(0, Math.min(events.length, Math.round(index)));
  if (i >= events.length && !useReplay.getState().playing) return goLive();
  ensureTimeline(events, useReplay.getState().skipIdle);
  publish(computeDerived(events, i), i, events);
  if (useReplay.getState().playing) anchor(i);
}

/** Move to the next / previous event that changes the picture. */
export function step(direction: 1 | -1) {
  const events = useApp.getState().events;
  let i = useReplay.getState().active ? useReplay.getState().index : events.length;
  if (direction > 0) {
    while (i < events.length) {
      i++;
      if (isMeaningful(events[i - 1])) break;
    }
  } else {
    while (i > 0) {
      i--;
      if (i === 0 || isMeaningful(events[i - 1])) break;
    }
  }
  seek(i);
}

function anchor(index: number) {
  startWall = performance.now();
  startElapsed = timeline[Math.min(index, timeline.length - 1)] ?? 0;
}

function tick(wall: number) {
  const r = useReplay.getState();
  if (!r.playing) return;
  const events = useApp.getState().events;
  const view = useView.getState().replay;
  if (!view) return;
  ensureTimeline(events, r.skipIdle);
  const elapsed = startElapsed + (wall - startWall) * r.speed;
  let idx = view.index;
  let changed = false;
  while (idx < events.length && timeline[idx] <= elapsed) {
    applyEvent(view.derived, events[idx]);
    idx++;
    changed = true;
  }
  // the clock keeps moving between events, so glows fade smoothly
  replayClock.now = idx > 0 ? events[idx - 1].ts + Math.max(0, elapsed - timeline[idx - 1]) : (events[0]?.ts ?? Date.now());
  if (idx >= events.length) {
    publish(view.derived, idx, events);
    return goLive();
  }
  if (changed && wall - lastNotify > 60) {
    lastNotify = wall;
    useView.setState({ replay: { derived: view.derived, now: replayClock.now, index: idx } });
    useReplay.setState({ index: idx });
  } else if (changed) {
    // keep our own bookkeeping current even when we skip the React notification this frame
    view.index = idx;
    useReplay.setState({ index: idx });
  }
  raf = requestAnimationFrame(tick);
}

export function play() {
  const events = useApp.getState().events;
  if (events.length === 0) return;
  let r = useReplay.getState();
  // pressing play while "live" starts the replay from the beginning
  if (!r.active || r.index >= events.length) seek(0);
  ensureTimeline(events, useReplay.getState().skipIdle);
  useReplay.setState({ playing: true });
  anchor(useReplay.getState().index);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

export function pause() {
  cancelAnimationFrame(raf);
  useReplay.setState({ playing: false });
  // publish the exact state we stopped at
  const view = useView.getState().replay;
  if (view) useView.setState({ replay: { derived: view.derived, now: replayClock.now, index: view.index } });
}

export function setSpeed(speed: number) {
  const wasPlaying = useReplay.getState().playing;
  useReplay.setState({ speed });
  if (wasPlaying) anchor(useReplay.getState().index);
}

export function setSkipIdle(skipIdle: boolean) {
  useReplay.setState({ skipIdle });
  const events = useApp.getState().events;
  ensureTimeline(events, skipIdle);
  if (useReplay.getState().playing) anchor(useReplay.getState().index);
}

/** Leave the replay and show the live state again. */
export function goLive() {
  cancelAnimationFrame(raf);
  useReplay.setState({ active: false, playing: false });
  useView.setState({ replay: null });
}

// If the view is reset from elsewhere (a different session was opened), leave replay mode cleanly.
useView.subscribe((s) => {
  if (!s.replay && useReplay.getState().active) {
    cancelAnimationFrame(raf);
    useReplay.setState({ active: false, playing: false });
  }
});
