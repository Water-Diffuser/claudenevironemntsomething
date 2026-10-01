// ============================================================================
//  Loads the language plugins listed in `languages` in indulgent.config.ts.
//  To add a language: create languages/<name>.ts, then add "<name>" to that list.
// ============================================================================
import path from 'node:path';
import { config } from '@config';
import type { LanguagePlugin } from './types.ts';

let loaded: Promise<LanguagePlugin[]> | null = null;

export function loadLanguages(): Promise<LanguagePlugin[]> {
  return (loaded ??= Promise.all(
    config.languages.map(async (name) => {
      try {
        return ((await import(`./${name}.ts`)) as { default: LanguagePlugin }).default;
      } catch (err) {
        console.warn(`  [analysis] could not load language "${name}":`, String((err as Error).message));
        return null;
      }
    }),
  ).then((list) => list.filter((p): p is LanguagePlugin => !!p)));
}

/** Find the plugin that handles a file, by its extension. */
export function pluginFor(plugins: LanguagePlugin[], file: string): LanguagePlugin | null {
  const ext = path.extname(file).toLowerCase();
  return plugins.find((p) => p.extensions.includes(ext)) ?? null;
}
