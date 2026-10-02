// ============================================================================
//  settings.ts: YOUR preferences (theme, labels, layout...).
//  Defaults come from indulgent.config.ts. Anything you change is autosaved to
//  ./data/settings.json on the server and wins over the defaults.
// ============================================================================
import { create } from 'zustand';
import { config } from '@config';
import type { Kind } from '@shared/events';
import type { ColorCode, NamedLayout } from '@shared/types';
import { defaultThemeSettings, type ThemeSettings } from '../theme/applyTheme';

export type LabelKey = keyof typeof config.labels;

export interface AudioSettings {
  master: number;
  music: number;
  tools: number;
  ui: number;
  alerts: number;
  muted: boolean;
}

export interface UISettings {
  theme: ThemeSettings;
  colorCode: Partial<ColorCode>;
  labels: Partial<Record<LabelKey, string>>;
  /** Your own words for READ / SEARCHED / EDITED... (the color code legend). */
  kindLabels: Partial<Record<Kind, string>>;
  /** Name of the layout currently shown. */
  layout: string;
  /** Layouts you edited or saved (these override the ones in the config, by name). */
  customLayouts: Record<string, NamedLayout>;
  /** Panels you hid. */
  hidden: string[];
  /** (Old) panels added to a layout from the panel menu. New versions open them in the dock instead. */
  extraPanels: string[];
  /** Feature switches you changed (on top of config.features). */
  features: Record<string, boolean>;
  /** Dishes (achievements) you have earned: id -> when. */
  dishes: Record<string, number>;
  /** Calm mode: no flashing, no glitch, no harsh sounds. */
  calm: boolean;
  /** Sound volumes (0 to 1) and the mute switch. */
  audio: AudioSettings;
  /** Is the sessions list (Setlist) open? */
  sidebarOpen: boolean;
  /** The dock (strip along the bottom): open or folded, how tall, which tab, and panels you opened in it yourself. */
  dockOpen: boolean;
  /** Heights you dragged the dock to, per panel (a panel you never resized uses its own default). */
  dockHeights: Record<string, number>;
  dockActive: string | null;
  dockExtra: string[];
  /** Which tab each tab group shows (group name -> panel id). */
  activeTabs: Record<string, string>;
  /** The file explorer inside the editor: shown, or folded away. */
  explorerOpen: boolean;
}

export const defaultUI = (): UISettings => ({
  theme: defaultThemeSettings(),
  colorCode: {},
  labels: {},
  kindLabels: {},
  layout: config.defaultLayout,
  customLayouts: {},
  hidden: [],
  extraPanels: [],
  features: {},
  dishes: {},
  calm: false,
  audio: { ...config.audio.volumes, muted: false },
  sidebarOpen: false,
  dockOpen: config.dock.startOpen,
  dockHeights: {},
  dockActive: null,
  dockExtra: [],
  activeTabs: {},
  explorerOpen: typeof window !== 'undefined' && window.innerWidth >= 1500,
});

interface SettingsStore {
  ui: UISettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<UISettings>) => void;
  replaceAll: (ui: UISettings) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(ui: UISettings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ui }) }).catch(() => {});
  }, 600);
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ui: defaultUI(),
  loaded: false,
  async load() {
    try {
      const saved = (await (await fetch('/api/settings')).json()) as { ui?: Partial<UISettings> };
      // Merge over the defaults so settings files from older versions still work.
      const base = defaultUI();
      set({ ui: { ...base, ...(saved.ui ?? {}), audio: { ...base.audio, ...(saved.ui?.audio ?? {}) } }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update(patch) {
    const ui = { ...get().ui, ...patch };
    set({ ui });
    scheduleSave(ui);
  },
  replaceAll(ui) {
    set({ ui });
    scheduleSave(ui);
  },
}));

/** The label for something, honoring your renames. */
export function useLabel(key: LabelKey): string {
  return useSettings((s) => s.ui.labels[key]) ?? config.labels[key];
}

/** The word for each color-code kind (READ, SEARCHED...), honoring your renames. */
export function useKindLabels(): Record<Kind, string> {
  const mine = useSettings((s) => s.ui.kindLabels);
  return { ...config.kindLabels, ...mine };
}

/** Is this feature (panel) switched on? */
export function isFeatureOn(ui: UISettings, id: string): boolean {
  return ui.features[id] ?? config.features[id] ?? true;
}
