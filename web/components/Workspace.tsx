// ============================================================================
//  Workspace: the tiled panel grid.
//
//  The screen is always config.grid.cols x config.grid.rows cells, stretched to
//  fill the window, so a layout survives any window size. Tiles meet edge to
//  edge (no gaps) and are separated by one thin line.
//
//  Panels do not move by accident: dragging and resizing only work in "arrange"
//  mode (the layout button in the top bar).
// ============================================================================
import { useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import { config } from '@config';
import type { LayoutItem } from '@shared/types';
import { useElementSize } from '../lib/useElementSize';
import { panelById } from '../panels/registry';
import { currentLayout, isEnabled, itemPanels } from '../settings/layouts';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { PanelFrame } from './PanelFrame';

export function Workspace() {
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  const arranging = useUI((s) => s.arranging);
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const { cols, rows } = config.grid;

  const layoutDef = currentLayout(ui);
  const layoutKey = ui.customLayouts[ui.layout] ? ui.layout : config.layouts[ui.layout] ? ui.layout : config.defaultLayout;

  // The cells to draw: each layout item, with only the panels in it that are switched on.
  // A cell whose panels are all hidden simply isn't drawn.
  const cells = useMemo(
    () =>
      layoutDef.items
        .map((item) => ({ item, panels: itemPanels(item).filter((id) => isEnabled(ui, id)).map((id) => panelById(id)!) }))
        .filter((c) => c.panels.length > 0),
    [layoutDef, ui],
  );

  const items: Array<LayoutItem & { minW: number; minH: number }> = cells.map(({ item, panels }) => ({
    ...item,
    minW: Math.max(...panels.map((p) => p.minW ?? 3)),
    minH: Math.max(...panels.map((p) => p.minH ?? 3)),
  }));

  // `rows` rows exactly fill the available height.
  const rowHeight = Math.max(8, height / rows);

  // On a narrow window the tiles would be tiny, so all the layout's panels become tabs of one big panel.
  const stacked = width > 0 && width < config.grid.stackBelow;
  if (stacked) {
    const all = cells.flatMap((c) => c.panels);
    return (
      <div ref={ref} className="min-h-0 min-w-0 flex-1 overflow-hidden border-t border-line">
        {all.length > 0 && <PanelFrame cellId="stack" panels={all} />}
      </div>
    );
  }

  return (
    <div ref={ref} className={`min-h-0 min-w-0 flex-1 overflow-hidden border-t border-line ${arranging ? 'arranging' : ''}`}>
      {width > 0 && height > 0 && (
        <GridLayout
          key={layoutKey}
          width={width}
          layout={items}
          gridConfig={{ cols, rowHeight, margin: [0, 0], containerPadding: [0, 0], maxRows: rows }}
          dragConfig={{ enabled: arranging, bounded: true, handle: '.panel-head', cancel: '.no-drag', threshold: 3 }}
          resizeConfig={{ enabled: arranging, handles: ['se'] }}
          onLayoutChange={(next) => {
            // Save only real changes (the grid also reports once on startup).
            const moved = next.some((n) => {
              const old = items.find((o) => o.i === n.i);
              return !old || old.x !== n.x || old.y !== n.y || old.w !== n.w || old.h !== n.h;
            });
            if (!moved) return;
            // Keep each cell's tabs, and keep the cells that are hidden right now.
            const placed = new Map(next.map((n) => [n.i, n]));
            const saved: LayoutItem[] = layoutDef.items.map((item) => {
              const n = placed.get(item.i);
              return n ? { ...item, x: n.x, y: n.y, w: n.w, h: n.h } : item;
            });
            update({ customLayouts: { ...ui.customLayouts, [layoutKey]: { label: layoutDef.label, items: saved } } });
          }}
        >
          {cells.map(({ item, panels }) => (
            <div key={item.i}>
              <PanelFrame cellId={item.i} panels={panels} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
