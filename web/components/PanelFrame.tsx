// ============================================================================
//  PanelFrame: the thin frame around one grid cell.
//
//    * a cell with ONE panel shows its icon and name in a slim header
//    * a cell with SEVERAL panels (a tab group) shows them as tabs; only the
//      selected tab is drawn, so the others cost nothing and don't compete
//    * the header is a drag handle only in "arrange" mode, where each tab also
//      gets a small x to hide that panel
// ============================================================================
import { X } from 'lucide-react';
import { Suspense } from 'react';
import { config } from '@config';
import type { PanelDef } from '../panels/registry';
import { useSettings } from '../state/settings';
import { useElementSize } from '../lib/useElementSize';
import { useUI } from '../state/ui';

export function PanelFrame({ cellId, panels }: { cellId: string; panels: PanelDef[] }) {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const arranging = useUI((s) => s.arranging);

  const nameOf = (p: PanelDef) => ui.labels[p.label] ?? config.labels[p.label];
  const active = panels.find((p) => p.id === ui.activeTabs[cellId]) ?? panels[0];
  const Body = active.component;
  const grouped = panels.length > 1;
  const hide = (id: string) => update({ hidden: [...ui.hidden, id] });
  // Tabs show only their icon, except the selected one, unless the header is wide enough for every name.
  const { ref: headRef, width: headWidth } = useElementSize<HTMLDivElement>();
  const showAllNames = headWidth >= panels.length * 124 + 24;

  // A "bare" panel draws its own top row. (While arranging we still show the frame's header, so you can drag it.)
  const bare = !grouped && !!active.bare && !arranging;

  return (
    <section className="panel" aria-label={nameOf(active)}>
      <div ref={headRef} className="panel-head" hidden={bare}>
        {grouped ? (
          <div className="tabs" role="tablist" aria-label="Views">
            {panels.map((p) => {
              const Icon = p.icon;
              const selected = p.id === active.id;
              return (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={selected}
                  className="tab"
                  title={nameOf(p)}
                  onClick={() => update({ activeTabs: { ...ui.activeTabs, [cellId]: p.id } })}
                >
                  <Icon size={14} />
                  {/* the selected tab shows its name; the others stay icon-only until there is room for all of them */}
                  {(selected || showAllNames) && <span>{nameOf(p)}</span>}
                  {arranging && (
                    <span
                      role="button"
                      aria-label={`Hide ${nameOf(p)}`}
                      className="grid size-4 place-items-center rounded hover:bg-surface-hi"
                      onClick={(e) => (e.stopPropagation(), hide(p.id))}
                    >
                      <X size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel-title">
            <active.icon size={14} className="text-dim" />
            <span className="truncate">{nameOf(active)}</span>
          </div>
        )}
        {arranging && !grouped && (
          <button className="icon-btn icon-btn-sm no-drag ml-auto" aria-label={`Hide ${nameOf(active)}`} title="Hide this panel" onMouseDown={(e) => e.stopPropagation()} onClick={() => hide(active.id)}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="panel-body">
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
    </section>
  );
}
