// ============================================================================
//  setup.ts: export / import your whole setup (theme, colors, layouts, labels,
//  features, sound volumes) as ONE json file.
//  Your earned Dishes (achievements) stay with you: they are not part of a setup.
// ============================================================================
import { config } from '@config';
import { defaultUI, type UISettings } from '../state/settings';

const FORMAT = 'indulgent-setup';

export function exportSetup(ui: UISettings): string {
  const { dishes: _dishes, ...setup } = ui;
  return JSON.stringify({ format: FORMAT, version: 1, ui: setup }, null, 2);
}

/** Make the browser download a text file. */
export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const kind = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Turn the text of an exported file into settings. Anything unknown or of the wrong type is ignored,
 * so a hand-edited or outdated file can't break the app. Throws an Error with a friendly message if it isn't a setup file at all.
 */
export function importSetup(text: string, current: UISettings): UISettings {
  let data: { format?: string; ui?: Record<string, unknown> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.format !== FORMAT || !data.ui || typeof data.ui !== 'object') throw new Error('That does not look like an INDULGENT setup file.');

  const base = defaultUI() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (key === 'dishes' || !(key in data.ui)) continue;
    if (kind(data.ui[key]) === kind(base[key])) out[key] = data.ui[key];
  }
  const ui = out as unknown as UISettings;
  // settings nested one level deep: keep the defaults for anything missing
  ui.audio = { ...defaultUI().audio, ...(typeof data.ui.audio === 'object' ? (data.ui.audio as object) : {}) };
  ui.theme = { base: config.themes[ui.theme.base] ? ui.theme.base : config.defaultTheme, overrides: typeof ui.theme.overrides === 'object' && ui.theme.overrides ? ui.theme.overrides : {} };
  ui.dishes = current.dishes;
  return ui;
}
