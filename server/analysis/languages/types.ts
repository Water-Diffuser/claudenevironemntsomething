// ============================================================================
//  LANGUAGE PLUGINS
//  Teaching the analyzer a new language = one small file in this folder that
//  exports a `LanguagePlugin` (see typescript.ts or python.ts for examples),
//  plus adding its name to `languages` in indulgent.config.ts. See the README.
// ============================================================================
import type { Node } from 'web-tree-sitter';
import type { ImportInfo, SymbolInfo } from '../../../shared/scan.ts';

export type RawImport = Omit<ImportInfo, 'resolved'>;

/** What a plugin pulls out of one file. */
export interface Extracted {
  imports: RawImport[];
  symbols: SymbolInfo[];
}

/** Turns an import's text ("./utils") into a project file path. Made once per project scan. */
export type Resolver = (spec: string, fromFile: string) => string | null;

export interface LanguagePlugin {
  /** Short id, also the name used in indulgent.config.ts. */
  id: string;
  /** Shown in the UI. */
  label: string;
  /** File extensions this plugin handles (with the dot). */
  extensions: string[];
  /**
   * Which tree-sitter grammar to parse this file with. The name is the part after
   * "tree-sitter-" in node_modules/tree-sitter-wasms/out/ (e.g. "typescript", "python", "go").
   */
  grammar: (ext: string) => string;
  /** Start of a one-line comment (used by the Rehearsal fake edits). */
  commentPrefix: string;
  /** Read the syntax tree and list the imports and the functions/classes. */
  extract: (root: Node) => Extracted;
  /** Build a function that resolves import text to files in this project. */
  createResolver: (projectRoot: string, files: Set<string>) => Resolver;
}

/** Helper so plugin files get type checking and autocomplete. */
export const defineLanguage = (plugin: LanguagePlugin): LanguagePlugin => plugin;
