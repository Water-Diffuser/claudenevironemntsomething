// "Panels": which panels are on screen, and your saved layouts.
// (Drag a panel's title bar to move it, drag its bottom-right corner to resize it. Both are saved automatically.)
import { useState } from 'react';
import { Check, Save, Trash2, Undo2 } from 'lucide-react';
import { config } from '@config';
import { PANELS } from '../panels/registry';
import { isFeatureOn, useSettings } from '../state/settings';
import { Section, Toggle } from './controls';
import { allLayouts, isShown, resetOrDeleteLayout, saveLayoutAs, setPanelShown, switchLayout } from './layouts';

export function PanelsTab() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const [name, setName] = useState('');
  const layouts = allLayouts(ui);
  const panelIds = new Set(PANELS.map((p) => p.id));
  // switches that aren't panels (the HUD strip, sound...)
  const otherFeatures = Object.keys(config.features).filter((f) => !panelIds.has(f));

  return (
    <>
      <Section title="Layouts" hint="A layout is which panels are on screen and where. Drag panels around and it is saved into the layout you are on.">
        <div className="space-y-1.5">
          {Object.entries(layouts).map(([key, l]) => {
            const on = ui.layout === key;
            const builtin = !!config.layouts[key];
            const edited = builtin && !!ui.customLayouts[key];
            return (
              <div key={key} className={`flex items-center gap-1 rounded-lg border ${on ? 'border-accent bg-accent/10' : 'border-line'}`}>
                <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={() => switchLayout(key)} aria-pressed={on}>
                  <span className="grid size-4 shrink-0 place-items-center">{on && <Check size={14} className="text-accent" />}</span>
                  <span className="truncate font-semibold">{l.label}</span>
                  {!builtin && <span className="chip !py-0 text-[0.62rem]">yours</span>}
                  {edited && <span className="chip !py-0 text-[0.62rem]">edited</span>}
                </button>
                {(edited || !builtin) && (
                  <button
                    className="mr-1 rounded p-1.5 text-dim hover:text-ink"
                    onClick={() => resetOrDeleteLayout(key)}
                    title={builtin ? 'Undo your changes to this layout' : 'Delete this layout'}
                    aria-label={builtin ? `Reset ${l.label}` : `Delete ${l.label}`}
                  >
                    {builtin ? <Undo2 size={14} /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            saveLayoutAs(name);
            setName('');
          }}
        >
          <input className="field !py-1" placeholder="Save what you see as…" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="Name for a new layout" />
          <button className="btn btn-primary shrink-0 !px-2.5 !py-1 text-xs" type="submit" disabled={!name.trim()}>
            <Save size={13} /> save
          </button>
        </form>
      </Section>

      <Section title="Panels" hint="Untick to hide a panel (this also frees the computer from drawing it). Hiding lasts until you switch layouts, unless you save the layout.">
        <div className="grid grid-cols-1 gap-1.5">
          {PANELS.map((p) => {
            const Icon = p.icon;
            const label = ui.labels[p.label] ?? config.labels[p.label];
            return (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={isShown(ui, p.id)} onChange={(e) => setPanelShown(p.id, e.target.checked)} />
                <Icon size={14} className="text-accent-2" />
                <span className="truncate">{label}</span>
                {!isFeatureOn(ui, p.id) && <span className="chip !py-0 text-[0.62rem]">off in settings</span>}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Features" hint="Whole features you can switch off.">
        {otherFeatures.map((f) => (
          <Toggle
            key={f}
            label={f === 'hud' ? 'The HUD strip (avatar, Fullness, The Tab, stars)' : f === 'sound' ? 'Sound' : f}
            checked={isFeatureOn(ui, f)}
            onChange={(v) => update({ features: { ...ui.features, [f]: v } })}
          />
        ))}
      </Section>
    </>
  );
}
