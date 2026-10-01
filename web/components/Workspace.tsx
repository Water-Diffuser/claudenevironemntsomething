// The draggable, resizable panel grid. The screen is always config.grid.cols x config.grid.rows
// cells, stretched to fill the window, so layouts survive any window size.
import { Suspense, useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import { config } from '@config';
import type { LayoutItem } from '@shared/types';
import { useElementSize } from '../lib/useElementSize';
import { PANELS } from '../panels/registry';
import { isFeatureOn, useSettings } from '../state/settings';
import { PanelFrame } from './PanelFrame';

export function Workspace() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const { cols, rows, margin } = config.grid;

  const visible = useMemo(() => PANELS.filter((p) => isFeatureOn(ui, p.id) && !ui.hidden.includes(p.id)), [ui]);
  const layoutDef = ui.customLayouts[ui.layout] ?? config.layouts[ui.layout] ?? config.layouts[config.defaultLayout];

  // Panels in this layout that are visible, plus any visible panel the layout doesn't mention (placed at the bottom).
  const items: Array<LayoutItem & { minW?: number; minH?: number }> = useMemo(() => {
    const known = layoutDef.items.filter((i) => visible.some((p) => p.id === i.i));
    const missing = visible.filter((p) => !layoutDef.items.some((i) => i.i === p.id));
    return [
      ...known,
      ...missing.map((p) => ({ i: p.id, x: 0, y: rows, w: Math.min(cols, 12), h: 8 })),
    ].map((i) => {
      const def = PANELS.find((p) => p.id === i.i);
      return { ...i, minW: def?.minW ?? 3, minH: def?.minH ?? 3 };
    });
  }, [layoutDef, visible, cols, rows]);

  // Stretch rows so `rows` rows exactly fill the available height.
  const rowHeight = Math.max(8, (height - margin * (rows + 1)) / rows);

  return (
    <div ref={ref} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
      {width > 0 && height > 0 && (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={{ cols, rowHeight, margin: [margin, margin], containerPadding: [margin, margin], maxRows: Infinity }}
          dragConfig={{ enabled: true, bounded: false, handle: '.panel-head', threshold: 3 }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onLayoutChange={(next) => {
            // Save only real changes (the grid also reports once on startup).
            const moved = next.some((n) => {
              const old = items.find((o) => o.i === n.i);
              return !old || old.x !== n.x || old.y !== n.y || old.w !== n.w || old.h !== n.h;
            });
            if (!moved) return;
            const hiddenItems = layoutDef.items.filter((i) => !visible.some((p) => p.id === i.i));
            const saved: LayoutItem[] = [...next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), ...hiddenItems];
            update({ customLayouts: { ...ui.customLayouts, [ui.layout]: { label: layoutDef.label, items: saved } } });
          }}
        >
          {visible.map((p) => {
            const Body = p.component;
            return (
              <div key={p.id}>
                <PanelFrame id={p.id} label={p.label} icon={p.icon}>
                  <Suspense fallback={<div className="grid h-full place-items-center text-sm text-dim">Warming up…</div>}>
                    <Body />
                  </Suspense>
                </PanelFrame>
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
