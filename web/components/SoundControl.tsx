// The sound button in the top bar. Before you press it, nothing plays at all.
// After that it opens a small menu: master volume, one slider per kind of sound, mute.
import { useEffect, useRef, useState } from 'react';
import { Power, Volume2, VolumeX } from 'lucide-react';
import { initAudioDirector, useAudio } from '../audio/director';
import { engine } from '../audio/engine';
import { isFeatureOn, useLabel, useSettings, type AudioSettings } from '../state/settings';

const SLIDERS: Array<{ key: Exclude<keyof AudioSettings, 'muted'>; label: string; hint: string; test?: () => void }> = [
  { key: 'master', label: 'Master', hint: 'everything' },
  { key: 'music', label: 'Music', hint: 'the generated backing track' },
  { key: 'tools', label: 'Tool notes', hint: 'one note per tool call', test: () => engine.toolNote('edit') },
  { key: 'ui', label: 'Clicks', hint: 'buttons and popups', test: () => engine.play('click') },
  { key: 'alerts', label: 'Alerts', hint: 'errors, dishes, finishing a take', test: () => engine.play('course') },
];

export function SoundControl() {
  const on = useAudio((s) => s.on);
  const custom = useAudio((s) => s.custom);
  const featureOn = useSettings((s) => isFeatureOn(s.ui, 'sound'));
  const audio = useSettings((s) => s.ui.audio);
  const update = useSettings((s) => s.update);
  const startLabel = useLabel('startSession');
  const soundLabel = useLabel('sound');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // the director lives as long as the app does
  useEffect(() => initAudioDirector(), []);

  // close the menu when you click elsewhere or press Esc
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc));
  }, [open]);

  if (!featureOn) return null;

  if (!on) {
    return (
      <button className="btn btn-primary !px-2.5 !py-1 text-xs" onClick={() => void useAudio.getState().start()} title="Turn the sound on. Nothing plays until you press this.">
        <Volume2 size={14} /> {startLabel}
      </button>
    );
  }

  const set = (patch: Partial<AudioSettings>) => update({ audio: { ...audio, ...patch } });
  return (
    <div ref={box} className="relative">
      <button className="btn !px-2 !py-1" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={soundLabel} title={soundLabel}>
        {audio.muted ? <VolumeX size={16} className="text-dim" /> : <Volume2 size={16} className="text-accent-2" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-surface p-3 text-xs shadow-xl" role="dialog" aria-label={soundLabel}>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display tracking-widest text-accent-2">{soundLabel.toUpperCase()}</span>
            <button className={`btn !px-2 !py-0.5 text-xs ${audio.muted ? 'border-accent text-accent-2' : ''}`} onClick={() => set({ muted: !audio.muted })} aria-pressed={audio.muted}>
              {audio.muted ? <VolumeX size={12} /> : <Volume2 size={12} />} {audio.muted ? 'muted' : 'mute'}
            </button>
          </div>
          <div className="space-y-2">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block" title={s.hint}>
                <span className="flex justify-between text-dim">
                  {s.label}
                  <span>{Math.round(audio[s.key] * 100)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={audio[s.key]}
                  className="w-full"
                  onChange={(e) => set({ [s.key]: +e.target.value })}
                  onPointerUp={s.test}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-end justify-between gap-2 border-t border-line pt-2 text-dim">
            <span className="leading-snug">{custom.length ? `${custom.length} of your own sounds loaded` : 'built-in sounds. Add yours in user-audio/'}</span>
            <button
              className="btn btn-ghost shrink-0 !px-1.5 !py-0.5 text-xs"
              onClick={() => (useAudio.getState().stop(), setOpen(false))}
              title="Back to silence. Press Start Session again to resume."
            >
              <Power size={12} /> off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
