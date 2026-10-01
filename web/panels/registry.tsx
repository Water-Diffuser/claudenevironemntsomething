// ============================================================================
//  PANEL REGISTRY: the list of every panel the app can show.
//  To add a panel: build a component, then add ONE line here, one entry in
//  config.labels / config.features, and a position in config.layouts.
// ============================================================================
import { BookMarked, Code2, Flame, FlaskConical, GitCompare, Map as MapIcon, Mic2, Network, NotebookPen, Radar, Ruler, type LucideIcon } from 'lucide-react';
import { lazy, type ComponentType } from 'react';
import type { LabelKey } from '../state/settings';
import { BoothPanel } from './booth/BoothPanel';
import { MapPanel } from './map/MapPanel';

// The code editor is big, so these two load only when first shown.
const CodePanel = lazy(() => import('./code/CodePanel'));
const DiffPanel = lazy(() => import('./diff/DiffPanel'));
const GraphPanel = lazy(() => import('./graph/GraphPanel'));
const ImpactPanel = lazy(() => import('./impact/ImpactPanel'));
const ExplainPanel = lazy(() => import('./explain/ExplainPanel'));
const SketchPanel = lazy(() => import('./sketch/SketchPanel'));
const TestsPanel = lazy(() => import('./tests/TestsPanel'));
const TrailsPanel = lazy(() => import('./trails/TrailsPanel'));
const GitPanel = lazy(() => import('./git/GitPanel'));

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
  { id: 'code', label: 'code', icon: Code2, component: CodePanel, minW: 5, minH: 5 },
  { id: 'diff', label: 'diff', icon: GitCompare, component: DiffPanel, minW: 5, minH: 4 },
  { id: 'graph', label: 'graph', icon: Network, component: GraphPanel, minW: 6, minH: 6 },
  { id: 'impact', label: 'impact', icon: Radar, component: ImpactPanel, minW: 4, minH: 5 },
  { id: 'explain', label: 'explain', icon: NotebookPen, component: ExplainPanel, minW: 4, minH: 5 },
  { id: 'sketch', label: 'sketch', icon: Ruler, component: SketchPanel, minW: 5, minH: 5 },
  { id: 'tests', label: 'tests', icon: FlaskConical, component: TestsPanel, minW: 5, minH: 5 },
  { id: 'trails', label: 'trails', icon: Flame, component: TrailsPanel, minW: 4, minH: 5 },
  { id: 'git', label: 'git', icon: BookMarked, component: GitPanel, minW: 5, minH: 5 },
];

export const panelById = (id: string) => PANELS.find((p) => p.id === id);
