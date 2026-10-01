// ============================================================================
//  The Mixing Desk: the settings drawer. It sits beside the panels and pushes
//  them aside (instead of covering them), so every change you make to the theme
//  is visible live on the real app.
// ============================================================================
import { useState, type ReactElement } from 'react';
import { LayoutGrid, Package, Palette, Pipette, Type, X, type LucideIcon } from 'lucide-react';
import { useLabel } from '../state/settings';
import { useUI } from '../state/ui';
import { ColorsTab } from './ColorsTab';
import { LookTab } from './LookTab';
import { PanelsTab } from './PanelsTab';
import { SetupTab } from './SetupTab';
import { WordsTab } from './WordsTab';

const TABS: Array<{ id: string; label: string; icon: LucideIcon; body: () => ReactElement }> = [
  { id: 'look', label: 'Look', icon: Palette, body: LookTab },
  { id: 'colors', label: 'Colors', icon: Pipette, body: ColorsTab },
  { id: 'panels', label: 'Panels', icon: LayoutGrid, body: PanelsTab },
  { id: 'words', label: 'Words', icon: Type, body: WordsTab },
  { id: 'setup', label: 'Setup', icon: Package, body: SetupTab },
];

export function SettingsDrawer() {
  const open = useUI((s) => s.settingsOpen);
  const close = () => useUI.getState().openSettings(false);
  const title = useLabel('settings');
  const [tab, setTab] = useState('look');
  if (!open) return null;
  const Body = (TABS.find((t) => t.id === tab) ?? TABS[0]).body;

  return (
    <aside
      className="drawer-in shrink-0 py-[var(--grid-gap)] pr-[var(--grid-gap)] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:p-2"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <div className="panel gloss flex h-full w-[23rem] max-w-[calc(100vw-1rem)] flex-col">
        <div className="panel-head">
          <span className="truncate">{title}</span>
          <button className="ml-auto rounded p-1 text-dim hover:text-ink" onClick={close} aria-label="Close settings">
            <X size={15} />
          </button>
        </div>
        <div className="flex shrink-0 border-b border-line" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 border-b-2 py-1.5 text-[0.68rem] uppercase tracking-wider transition ${tab === t.id ? 'border-accent text-accent-2' : 'border-transparent text-dim hover:text-ink'}`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="panel-body min-h-0 flex-1 overflow-y-auto" role="tabpanel">
          <Body />
        </div>
      </div>
    </aside>
  );
}
