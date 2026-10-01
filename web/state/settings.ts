// ============================================================================
//  settings.ts: YOUR preferences (theme, labels, layout...).
//  Defaults come from indulgent.config.ts. Anything you change is autosaved to
//  ./data/settings.json on the server and wins over the defaults.
// ============================================================================
import { create } from 'zustand';
import { config } from '@config';
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
  /** Name of the layout currently shown. */
  layout: string;
  /** Layouts you edited or saved (these override the ones in the config, by name). */
  customLayouts: Record<string, NamedLayout>;
  /** Panels you hid. */
  hidden: string[];
  /** Panels you added to the current layout from the panel menu (they appear at the bottom). */
  extraPanels: string[];
  /** Feature switches you changed (on top of config.features). */
  features: Record<string, boolean>;
  /** Dishes (achievements) you have earned: id -> when. */
  dishes: Record<string, number>;
  /** Calm mode: no flashing, no glitch, no harsh sounds. */
  calm: boolean;
  /** Sound volumes (0 to 1) and the mute switch. */
  audio: AudioSettings;
  sidebarOpen: boolean;
}

export const defaultUI = (): UISettings => ({
  theme: defaultThemeSettings(),
  colorCode: {},
  labels: {},
  layout: config.defaultLayout,
  customLayouts: {},
  hidden: [],
  extraPanels: [],
  features: {},
  dishes: {},
  calm: false,
  audio: { ...config.audio.volumes, muted: false },
  sidebarOpen: true,
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

/** Is this feature (panel) switched on? */
export function isFeatureOn(ui: UISettings, id: string): boolean {
  return ui.features[id] ?? config.features[id] ?? true;
}
