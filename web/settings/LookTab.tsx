// "Look": mood presets, colors, fonts, sizes and effects. Everything updates the app live.
import { RotateCcw } from 'lucide-react';
import { config } from '@config';
import type { ThemeColors } from '@shared/types';
import { useSettings } from '../state/settings';
import { resolveTheme, type ThemeSettings } from '../theme/applyTheme';
import { ColorField, Section, Slider, Toggle } from './controls';

const COLOR_LABELS: Array<[keyof ThemeColors, string]> = [
  ['bg', 'Background'],
  ['bgAlt', 'Background (second)'],
  ['surface', 'Panels'],
  ['surfaceHi', 'Panels (raised)'],
  ['border', 'Borders'],
  ['text', 'Text'],
  ['textDim', 'Dim text'],
  ['accent', 'Accent'],
  ['accent2', 'Accent (light)'],
  ['onAccent', 'Text on accent'],
  ['good', 'Good'],
  ['warn', 'Warning'],
  ['bad', 'Bad'],
];

const EFFECTS: Array<['scanlines' | 'noise' | 'glow' | 'glitch' | 'gloss', string]> = [
  ['scanlines', 'Scanlines'],
  ['noise', 'VHS noise'],
  ['glow', 'Glow'],
  ['glitch', 'Glitch'],
  ['gloss', 'Gloss (shiny highlights)'],
];

function FontSelect({ label, value, onChange }: { label: string; value: string; onChange: (stack: string) => void }) {
  const known = config.fontChoices.some((f) => f.stack === value);
  return (
    <label className="block text-xs">
      <span className="text-dim">{label}</span>
      <select className="field mt-0.5 !py-1" value={known ? value : '__custom'} onChange={(e) => e.target.value !== '__custom' && onChange(e.target.value)}>
        {!known && <option value="__custom">Custom (from the config file)</option>}
        {config.fontChoices.map((f) => (
          <option key={f.stack} value={f.stack}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LookTab() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const theme = resolveTheme(ui.theme);
  const ov = ui.theme.overrides;
  const setOv = (patch: ThemeSettings['overrides']) => update({ theme: { ...ui.theme, overrides: { ...ov, ...patch } } });
  const tweaked = Object.keys(ov).length > 0;

  return (
    <>
      <Section title="Mood" hint="Pick a starting point, then tweak it below. Picking a mood clears your tweaks.">
        <div className="grid gap-2">
          {Object.entries(config.themes).map(([id, t]) => {
            const on = ui.theme.base === id;
            return (
              <button
                key={id}
                onClick={() => update({ theme: { base: id, overrides: {} } })}
                aria-pressed={on}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${on ? 'border-accent bg-accent/10' : 'border-line hover:border-accent-2'}`}
              >
                <span className="flex shrink-0 overflow-hidden rounded-md border border-line">
                  {[t.colors.bg, t.colors.surface, t.colors.accent, t.colors.accent2].map((c) => (
                    <span key={c} className="block h-7 w-4" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-xs text-dim">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Colors"
        actions={
          <button className="btn btn-ghost !px-1.5 !py-0.5 text-xs" disabled={!tweaked} onClick={() => update({ theme: { ...ui.theme, overrides: {} } })} title="Go back to the mood's own values">
            <RotateCcw size={12} /> reset tweaks
          </button>
        }
      >
        {COLOR_LABELS.map(([key, label]) => (
          <ColorField key={key} label={label} value={theme.colors[key]} onChange={(v) => setOv({ colors: { ...ov.colors, [key]: v } })} />
        ))}
        <Toggle label="Dark theme" hint="Tells the browser to use dark scrollbars and form fields." checked={theme.dark} onChange={(v) => setOv({ dark: v })} />
      </Section>

      <Section title="Fonts">
        <FontSelect label="Headings" value={theme.fonts.display} onChange={(v) => setOv({ fonts: { ...ov.fonts, display: v } })} />
        <FontSelect label="Text" value={theme.fonts.body} onChange={(v) => setOv({ fonts: { ...ov.fonts, body: v } })} />
        <FontSelect label="Code" value={theme.fonts.mono} onChange={(v) => setOv({ fonts: { ...ov.fonts, mono: v } })} />
      </Section>

      <Section title="Size & motion">
        <Slider label="Font size" value={theme.fontSize} min={11} max={20} step={1} format={(v) => `${v}px`} onChange={(v) => setOv({ fontSize: v })} />
        <Slider label="Corner roundness" value={theme.radius} min={0} max={28} step={1} format={(v) => `${v}px`} onChange={(v) => setOv({ radius: v })} />
        <Slider label="Animation speed" value={theme.animSpeed} min={0.25} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setOv({ animSpeed: v })} />
      </Section>

      <Section title="Effects" hint={ui.calm ? 'Calm mode is on, so flashing effects are switched off whatever these say.' : undefined}>
        {EFFECTS.map(([key, label]) => (
          <Slider key={key} label={label} value={theme.effects[key]} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setOv({ effects: { ...ov.effects, [key]: v } })} />
        ))}
        <Toggle label="Calm mode" hint="No flashing, glitching, warbling sounds or fast motion." checked={ui.calm} onChange={(calm) => update({ calm })} />
      </Section>
    </>
  );
}
