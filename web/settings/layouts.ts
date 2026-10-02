// ============================================================================
//  layouts.ts: helpers for switching, saving and editing panel layouts.
//
//  A layout = which panels are on screen and where. The built-in ones live in
//  indulgent.config.ts; yours (and any edits you make by dragging) are saved in settings.
//
//  Panels can be in one of two places:
//    1. the GRID: the tiles that fill the main area (a tile can be a tab group)
//    2. the DOCK: the strip along the bottom (Terminal, Tests, Git...)
// ============================================================================
import { config } from '@config';
import type { LayoutItem, NamedLayout } from '@shared/types';
import { panelById } from '../panels/registry';
import { isFeatureOn, useSettings, type UISettings } from '../state/settings';

/** Built-in layouts plus yours. (If you dragged panels around in a built-in one, your version wins.) */
export const allLayouts = (ui: UISettings): Record<string, NamedLayout> => ({ ...config.layouts, ...ui.customLayouts });

/** The key of the layout on screen. (An unknown name, e.g. from an older version, means the default.) */
export const currentLayoutKey = (ui: UISettings): string => (allLayouts(ui)[ui.layout] ? ui.layout : config.defaultLayout);

export const currentLayout = (ui: UISettings): NamedLayout => allLayouts(ui)[currentLayoutKey(ui)];

/** The panels one grid cell shows: a tab group shows all its tabs, a plain cell shows just itself. */
export const itemPanels = (item: LayoutItem): string[] => item.tabs ?? [item.i];

/** Every panel the current layout puts in the grid. */
export const gridPanelIds = (ui: UISettings): Set<string> => new Set(currentLayout(ui).items.flatMap(itemPanels));

/** Is this panel switched on (feature flag) and not hidden by you? */
export const isEnabled = (ui: UISettings, id: string): boolean => !!panelById(id) && isFeatureOn(ui, id) && !ui.hidden.includes(id);

/** The panels that live in the dock right now, in tab order (skipping ones the layout already shows). */
export function dockPanelIds(ui: UISettings): string[] {
  const inGrid = gridPanelIds(ui);
  const all = [...config.dock.panels, ...ui.dockExtra];
  return all.filter((id, i) => all.indexOf(id) === i && !inGrid.has(id) && isEnabled(ui, id));
}

/** Is this panel on screen right now (in the grid, or as a tab in the dock)? */
export function isShown(ui: UISettings, id: string): boolean {
  if (!isEnabled(ui, id)) return false;
  return gridPanelIds(ui).has(id) || [...config.dock.panels, ...ui.dockExtra].includes(id);
}

export function switchLayout(key: string) {
  // hiding panels belongs to the layout you were on, so each layout starts as it was saved
  useSettings.getState().update({ layout: key, hidden: [], extraPanels: [] });
}

/** Open the dock on a panel (adds it to the dock first if it is not there yet). */
export function openInDock(id: string) {
  const { ui, update } = useSettings.getState();
  const known = [...config.dock.panels, ...ui.dockExtra].includes(id);
  update({
    features: { ...ui.features, [id]: true },
    hidden: ui.hidden.filter((h) => h !== id),
    dockExtra: known || gridPanelIds(ui).has(id) ? ui.dockExtra : [...ui.dockExtra, id],
    dockOpen: true,
    dockActive: id,
  });
}

/** Bring a panel into view: select its tab if it is in a tab group, or open it in the dock if the layout does not show it. */
export function showPanel(id: string) {
  const { ui, update } = useSettings.getState();
  const cell = currentLayout(ui).items.find((i) => itemPanels(i).includes(id));
  if (!cell) return openInDock(id);
  update({ hidden: ui.hidden.filter((h) => h !== id), activeTabs: cell.tabs ? { ...ui.activeTabs, [cell.i]: id } : ui.activeTabs });
}

/** Show or hide one panel. A panel the layout does not place opens in the dock. */
export function setPanelShown(id: string, shown: boolean) {
  const { ui, update } = useSettings.getState();
  if (!shown) return update({ hidden: ui.hidden.includes(id) ? ui.hidden : [...ui.hidden, id] });
  if (gridPanelIds(ui).has(id)) return update({ features: { ...ui.features, [id]: true }, hidden: ui.hidden.filter((h) => h !== id) });
  openInDock(id);
}

/** Save what is on screen now as a new layout with this name, and switch to it. */
export function saveLayoutAs(name: string) {
  const { ui, update } = useSettings.getState();
  const cur = currentLayout(ui);
  // keep every cell that still has at least one visible panel; tab groups lose their hidden tabs
  const items = cur.items
    .map((item) => (item.tabs ? { ...item, tabs: item.tabs.filter((id) => isEnabled(ui, id)) } : item))
    .filter((item) => itemPanels(item).some((id) => isEnabled(ui, id)));
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
