// ============================================================================
//  director.ts: decides WHEN each sound plays.
//  It listens to what happens in the app (events, popups, achievements, clicks)
//  and tells the engine. The engine itself only knows how to make sounds.
// ============================================================================
import { create } from 'zustand';
import { avatarState } from '../components/Avatar';
import { dishListeners } from '../state/dishes';
import { useSettings, isFeatureOn } from '../state/settings';
import { eventListeners, useApp } from '../state/store';
import { engine, type Levels, type PlayName } from './engine';

interface AudioStore {
  /** Has the producer pressed "Start Session"? Until then everything is silent. */
  on: boolean;
  /** Names of the sounds you supplied in user-audio/. */
  custom: string[];
  start: () => Promise<void>;
  stop: () => void;
}

export const useAudio = create<AudioStore>((set) => ({
  on: false,
  custom: [],
  async start() {
    await engine.start();
    set({ on: engine.running });
    pushSettings();
  },
  stop() {
    engine.stop();
    set({ on: false, custom: [] });
  },
}));

engine.onCustomChange = (custom) => useAudio.setState({ custom });

/** Send the saved volumes / calm mode to the engine. */
function pushSettings() {
  const { audio, calm } = useSettings.getState().ui;
  engine.setLevels(audio as Levels);
  engine.setCalm(calm);
}

/** Call once when the app starts. Returns a function that undoes everything. */
export function initAudioDirector(): () => void {
  const undo: Array<() => void> = [];
  const enabled = () => useAudio.getState().on && isFeatureOn(useSettings.getState().ui, 'sound');
  const play = (name: PlayName) => enabled() && engine.play(name);

  // volumes and calm mode follow the settings
  undo.push(useSettings.subscribe((s, p) => (s.ui.audio !== p.ui.audio || s.ui.calm !== p.ui.calm) && pushSettings()));

  // the music's mood follows the avatar's mood (checked a few times a second, since "done" expires on its own)
  const moodTimer = window.setInterval(() => {
    if (enabled()) engine.setMood(avatarState(useApp.getState().derived, Date.now()));
  }, 300);
  undo.push(() => window.clearInterval(moodTimer));

  // what Claude does
  let served = useApp.getState().derived.served.size;
  undo.push(useApp.subscribe((s, p) => s.events !== p.events && (served = s.derived.served.size))); // a different session: start counting again
  const onEvent: (typeof eventListeners)[number] = (e, d) => {
    switch (e.kind) {
      case 'user_message':
        return play('send');
      case 'tool_start':
        return enabled() && engine.toolNote(e.toolKind);
      case 'tool_end':
        return e.ok ? undefined : play('error');
      case 'permission':
        return play(e.decision === 'asked' ? 'ask' : e.decision === 'allowed' ? 'allow' : 'deny');
      case 'turn_end':
        return play(e.ok ? 'done' : 'error');
      case 'todos':
        if (d.served.size > served) play('course');
        served = d.served.size;
    }
  };
  eventListeners.push(onEvent);
  undo.push(() => eventListeners.splice(eventListeners.indexOf(onEvent), 1));

  const onDish = () => play('dish');
  dishListeners.push(onDish);
  undo.push(() => dishListeners.splice(dishListeners.indexOf(onDish), 1));

  // a glassy tick for every button
  const onClick = (ev: MouseEvent) => {
    const el = (ev.target as Element | null)?.closest?.('button, a, select, summary, [role="button"], [role="tab"]');
    if (el && !el.closest('[data-silent]')) play('click');
  };
  document.addEventListener('click', onClick, true);
  undo.push(() => document.removeEventListener('click', onClick, true));

  return () => undo.forEach((f) => f());
}
