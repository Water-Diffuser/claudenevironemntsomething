// ============================================================================
//  What the project scanner learns about your code. Sent to the browser, which
//  draws the map (Cut Diagram) and the dependency graph (Pairings) from it.
// ============================================================================

export type SymbolKind = 'function' | 'class' | 'method' | 'type';

/** One thing a function calls, e.g. foo() or utils.foo(). */
export interface CallRef {
  name: string;
  /** The thing before the dot, if any: "utils" in utils.foo(). */
  receiver?: string;
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  /** Lines are 1-based. */
  startLine: number;
  endLine: number;
  exported: boolean;
  /** For methods: the class they belong to. */
  parent?: string;
  calls: CallRef[];
}

/** One import statement. */
export interface ImportInfo {
  /** The text in the quotes, e.g. "./utils" or "react". */
  spec: string;
  line: number;
  /** Project-relative path of the file it points to, or null if it's an outside package. */
  resolved: string | null;
  /** Names brought in: local = the name used in this file, imported = the name in the other file. */
  bindings: Array<{ local: string; imported: string }>;
  kind: 'static' | 'require' | 'dynamic' | 'reexport';
  typeOnly?: boolean;
}

export interface FileInfo {
  /** Project-relative path with forward slashes, e.g. "src/app/main.ts". */
  path: string;
  /** Lines of code (this is what sizes the cell on the map). */
  lines: number;
  bytes: number;
  /** Language id (e.g. "typescript") if the analyzer understands this file. */
  lang: string | null;
  /** True once imports/symbols have been extracted. */
  analyzed: boolean;
  imports?: ImportInfo[];
  symbols?: SymbolInfo[];
}

export interface ProjectScan {
  root: string;
  name: string;
  files: FileInfo[];
  /** True if the project was bigger than the scan limit. */
  truncated: boolean;
  skippedBinary: number;
  scannedAt: number;
}

/** A change to the scan: files added/updated, and files removed. */
export interface ScanPatch {
  upserts: FileInfo[];
  removed: string[];
  /** 0..1 while the background analysis is still running. */
  progress?: number;
}
