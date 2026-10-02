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
      className="drawer-in flex h-full w-[24rem] max-w-[100vw] shrink-0 flex-col border-l border-line bg-surface max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-[0_0_40px_rgb(0_0_0/0.55)]"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <button className="icon-btn icon-btn-sm ml-auto" onClick={close} aria-label="Close settings">
          <X size={15} />
        </button>
      </div>
      <div className="tabs shrink-0 border-b border-line px-1" role="tablist" style={{ height: 'var(--head-h)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="tab" title={t.label}>
              <Icon size={14} />
              <span className={tab === t.id ? '' : 'hidden'}>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        <Body />
      </div>
    </aside>
  );
}
