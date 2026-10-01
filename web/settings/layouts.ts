// ============================================================================
//  layouts.ts: helpers for switching, saving and editing panel layouts.
//  A layout = which panels are on screen and where. The built-in ones live in
//  indulgent.config.ts; yours (and any edits you make by dragging) are saved in settings.
// ============================================================================
import { config } from '@config';
import type { NamedLayout } from '@shared/types';
import { PANELS } from '../panels/registry';
import { isFeatureOn, useSettings, type UISettings } from '../state/settings';

/** Built-in layouts plus yours. (If you dragged panels around in a built-in one, your version wins.) */
export const allLayouts = (ui: UISettings): Record<string, NamedLayout> => ({ ...config.layouts, ...ui.customLayouts });

export const currentLayout = (ui: UISettings): NamedLayout => allLayouts(ui)[ui.layout] ?? config.layouts[config.defaultLayout];

/** Is this panel on screen right now? */
export function isShown(ui: UISettings, id: string): boolean {
  return isFeatureOn(ui, id) && !ui.hidden.includes(id) && (currentLayout(ui).items.some((i) => i.i === id) || ui.extraPanels.includes(id));
}

export function switchLayout(key: string) {
  // hiding / adding panels from the menu belongs to the layout you were on, so each layout starts as it was saved
  useSettings.getState().update({ layout: key, hidden: [], extraPanels: [] });
}

/** Show or hide one panel. */
export function setPanelShown(id: string, shown: boolean) {
  const { ui, update } = useSettings.getState();
  if (!shown) return update({ hidden: ui.hidden.includes(id) ? ui.hidden : [...ui.hidden, id] });
  const inLayout = currentLayout(ui).items.some((i) => i.i === id);
  update({
    features: { ...ui.features, [id]: true },
    hidden: ui.hidden.filter((h) => h !== id),
    extraPanels: inLayout || ui.extraPanels.includes(id) ? ui.extraPanels : [...ui.extraPanels, id],
  });
}

/** Save what is on screen now as a new layout with this name, and switch to it. */
export function saveLayoutAs(name: string) {
  const { ui, update } = useSettings.getState();
  const cur = currentLayout(ui);
  const items = PANELS.filter((p) => isShown(ui, p.id)).map(
    (p) => cur.items.find((i) => i.i === p.id) ?? { i: p.id, x: 0, y: config.grid.rows, w: Math.min(config.grid.cols, 12), h: 8 },
  );
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layout';
  let key = `mine-${slug}`;
  for (let n = 2; allLayouts(ui)[key]; n++) key = `mine-${slug}-${n}`;
  update({ customLayouts: { ...ui.customLayouts, [key]: { label: name.trim() || 'My layout', items } }, layout: key, hidden: [], extraPanels: [] });
}

/** Built-in layout: undo your dragging. Your own layout: delete it. */
export function resetOrDeleteLayout(key: string) {
  const { ui, update } = useSettings.getState();
  const { [key]: _gone, ...rest } = ui.customLayouts;
  const builtin = !!config.layouts[key];
  update({ customLayouts: rest, hidden: [], extraPanels: [], layout: builtin || ui.layout !== key ? ui.layout : config.defaultLayout });
}
