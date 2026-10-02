// ============================================================================
//  Dock: the strip along the bottom of the window.
//
//  It holds the "workshop" panels (Terminal, Tests, Git, Playback...) as tabs.
//  Folded, it is just a 32px tab bar, so it never competes with the work. Click
//  a tab to open it, click the selected tab (or the arrow) to fold it again, drag
//  its top edge to resize it. The "+" opens any other panel here.
// ============================================================================
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { config } from '@config';
import { PANELS, panelById, type PanelDef } from '../panels/registry';
import { dockPanelIds, gridPanelIds, isEnabled, openInDock } from '../settings/layouts';
import { useSettings } from '../state/settings';
import { useDerived } from '../state/store';
import { Menu, MenuItem, MenuLabel } from './Menu';

/** Height of the dock's tab bar in pixels (keep in sync with --dock-bar-h in the stylesheet). */
const DOCK_BAR = 32;

/** A small count or dot shown on a dock tab (e.g. failing tests). */
function useBadges(): Record<string, { text?: string; tone: 'bad' | 'good' | 'warn' | 'live' } | undefined> {
  const d = useDerived();
  const fails = d.lastTests.filter((t) => t.status === 'fail').length;
  const passes = d.lastTests.filter((t) => t.status === 'pass').length;
  const running = d.runs.some((r) => r.running);
  const todosOpen = d.todos.filter((t) => t.status !== 'completed').length;
  return {
    terminal: running ? { tone: 'live' } : undefined,
    tests: fails ? { text: String(fails), tone: 'bad' } : passes ? { tone: 'good' } : undefined,
    trails: d.errors.length ? { text: String(d.errors.length), tone: 'bad' } : undefined,
    menu: todosOpen ? { text: String(todosOpen), tone: 'warn' } : undefined,
  };
}

export function Dock() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const badges = useBadges();
  const d = useDerived();
  const [dragH, setDragH] = useState<number | null>(null); // height while you are dragging the top edge
  const shell = useRef<HTMLDivElement>(null);

  const ids = dockPanelIds(ui);
  const panels = ids.map((id) => panelById(id)!);
  const active: PanelDef | undefined = panels.find((p) => p.id === ui.dockActive) ?? panels[0];

  // Fold the dock if its last panel disappears.
  useEffect(() => {
    if (!panels.length && ui.dockOpen) update({ dockOpen: false });
  }, [panels.length, ui.dockOpen, update]);

  if (!active) return null;
  const Body = active.component;

  const maxH = typeof window === 'undefined' ? 600 : Math.round(window.innerHeight * config.dock.maxFraction);
  const clamp = (h: number) => Math.min(maxH, Math.max(config.dock.minHeight, h));
  const height = clamp(dragH ?? ui.dockHeights[active.id] ?? active.dockH ?? config.dock.height);
  const nameOf = (p: PanelDef) => ui.labels[p.label] ?? config.labels[p.label];

  const choose = (id: string) => {
    // a click on the selected tab folds the dock; any other tab opens it on that tab
    if (ui.dockOpen && id === active.id) update({ dockOpen: false });
    else update({ dockOpen: true, dockActive: id });
  };

  // Drag the top edge to resize. (Pointer capture keeps the drag going even if the mouse leaves the strip.)
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setDragH(clamp(startH + (startY - ev.clientY)));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      update({ dockHeights: { ...useSettings.getState().ui.dockHeights, [active.id]: clamp(startH + (startY - ev.clientY)) } });
      setDragH(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Panels that could still be opened here (not in the grid, not already in the dock).
  const inGrid = gridPanelIds(ui);
  const more = PANELS.filter((p) => !inGrid.has(p.id) && !ids.includes(p.id) && isEnabled(ui, p.id));
  const moreOff = PANELS.filter((p) => !inGrid.has(p.id) && !ids.includes(p.id) && !isEnabled(ui, p.id) && p.id !== 'booth');
  const lastRun = [...d.runs].reverse()[0];

  return (
    <div ref={shell} className="relative shrink-0 border-t border-line bg-surface" style={{ height: ui.dockOpen ? height + DOCK_BAR : DOCK_BAR }}>
      {ui.dockOpen && (
        <div
          className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none hover:bg-accent/30"
          onPointerDown={startDrag}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the dock"
        />
      )}
      <div className="flex items-stretch border-b border-line bg-bg-alt pl-1 pr-2" style={{ height: DOCK_BAR, borderBottomColor: ui.dockOpen ? undefined : 'transparent' }}>
        <div className="tabs" role="tablist" aria-label="Dock">
          {panels.map((p) => {
            const Icon = p.icon;
            const b = badges[p.id];
            const selected = ui.dockOpen && p.id === active.id;
            return (
              <button key={p.id} role="tab" aria-selected={selected} className="tab" title={nameOf(p)} onClick={() => choose(p.id)}>
                <Icon size={14} />
                <span className="max-md:hidden">{nameOf(p)}</span>
                {b?.tone === 'live' ? (
                  <Loader2 size={12} className="animate-spin text-warn" aria-label="running" />
                ) : b ? (
                  <span className={`inline-flex min-w-[1.1em] items-center justify-center rounded-full px-1 text-xs leading-none ${b.text ? 'py-0.5' : 'size-1.5 p-0'} ${b.tone === 'bad' ? 'bg-bad text-bg' : b.tone === 'good' ? 'bg-good' : 'bg-warn text-bg'}`}>
                    {b.text}
                  </span>
                ) : null}
              </button>
            );
          })}
          {(more.length > 0 || moreOff.length > 0) && (
            <Menu
              label="Open a panel in the dock"
              side="top"
              trigger={({ open, toggle }) => (
                <button className="icon-btn icon-btn-sm my-auto" aria-label="Open another panel here" title="Open another panel here" aria-expanded={open} onClick={toggle}>
                  <Plus size={15} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Open in the dock</MenuLabel>
                  {[...more, ...moreOff].map((p) => {
                    const Icon = p.icon;
                    return (
                      <MenuItem key={p.id} icon={<Icon size={14} />} onSelect={() => (openInDock(p.id), close())}>
                        {nameOf(p)}
                      </MenuItem>
                    );
                  })}
                </>
              )}
            </Menu>
          )}
        </div>

        {/* what the last command did, at a glance (the full output is in the Terminal tab) */}
        {lastRun && (
          <div className="ml-auto mr-2 flex min-w-0 items-center gap-2 self-center text-xs text-dim max-md:hidden" title={lastRun.command}>
            <span className={`size-1.5 shrink-0 rounded-full ${lastRun.running ? 'bg-warn' : lastRun.ok ? 'bg-good' : 'bg-bad'}`} />
            <span className="max-w-[18rem] truncate font-mono">{lastRun.command}</span>
          </div>
        )}
        <button className={`icon-btn icon-btn-sm self-center ${lastRun ? '' : 'ml-auto'}`} aria-label={ui.dockOpen ? 'Fold the dock' : 'Open the dock'} title={ui.dockOpen ? 'Fold the dock' : 'Open the dock'} onClick={() => update({ dockOpen: !ui.dockOpen })}>
          {ui.dockOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {ui.dockOpen && (
        <div className="min-h-0 overflow-auto" style={{ height: `calc(100% - ${DOCK_BAR}px)` }} role="tabpanel">
          <Suspense
            fallback={
              <div className="empty">
                <span className="text-xs">Warming up…</span>
              </div>
            }
          >
            <Body />
          </Suspense>
        </div>
      )}
    </div>
  );
}
