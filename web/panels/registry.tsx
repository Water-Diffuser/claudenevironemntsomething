// ============================================================================
//  PANEL REGISTRY: the list of every panel the app can show.
//  To add a panel: build a component, then add ONE line here, one entry in
//  config.labels / config.features, and a position in config.layouts.
// ============================================================================
import { Map as MapIcon, Mic2, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LabelKey } from '../state/settings';
import { BoothPanel } from './booth/BoothPanel';
import { MapPanel } from './map/MapPanel';

export interface PanelDef {
  /** Unique id, also used in config.layouts and config.features. */
  id: string;
  /** Key into config.labels (so the title can be renamed). */
  label: LabelKey;
  icon: LucideIcon;
  component: ComponentType;
  minW?: number;
  minH?: number;
}

export const PANELS: PanelDef[] = [
  { id: 'booth', label: 'booth', icon: Mic2, component: BoothPanel, minW: 6, minH: 6 },
  { id: 'map', label: 'map', icon: MapIcon, component: MapPanel, minW: 6, minH: 6 },
];

export const panelById = (id: string) => PANELS.find((p) => p.id === id);
