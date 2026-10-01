// ============================================================================
//  scanner.ts: read a project folder.
//
//  Phase 1 (fast):  list every file and count its lines  ->  the map can draw.
//  Phase 2 (slower): parse source files for imports + functions  ->  the graph.
//  They are separate so the map appears almost instantly, even on big projects.
// ============================================================================
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '@config';
import type { FileInfo, ImportInfo } from '../../shared/scan.ts';
import { dataRoot } from '../store/jsonStore.ts';
import { loadLanguages, pluginFor } from './languages/index.ts';
import type { LanguagePlugin, Resolver } from './languages/types.ts';
import { withTree } from './parser.ts';

const execFileP = promisify(execFile);
const ignoreDirs = new Set(config.scan.ignoreDirs);

/** Is this project-relative path inside a folder we always skip (node_modules, .git...)? */
export function isIgnoredPath(rel: string, root?: string): boolean {
  if (rel.split('/').some((seg) => ignoreDirs.has(seg))) return true;
  // This app's own data folder (saved sessions) is never part of the project, even when you open this app's own folder.
  if (root) {
    const abs = path.resolve(root, rel);
    if (abs === dataRoot || abs.startsWith(dataRoot + path.sep)) return true;
  }
  return false;
}

/** Ask git which files belong to the project (respects .gitignore). Returns null if it isn't a git repo. */
async function gitFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileP('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    return stdout.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

/** Fallback for folders that aren't git repos: walk the tree ourselves. */
async function walkFiles(root: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  const stack = [''];
  while (stack.length && out.length < limit) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!ignoreDirs.has(e.name)) stack.push(childRel);
      } else if (e.isFile()) out.push(childRel);
    }
  }
  return out;
}

export interface ScanResult {
  files: FileInfo[];
  truncated: boolean;
  skippedBinary: number;
}

/** Read one file: count lines, detect binary. Returns null if it should not appear on the map. */
export async function statFile(root: string, rel: string): Promise<{ info: FileInfo; binary: boolean } | null> {
  const abs = path.join(root, rel);
  try {
    const st = await fs.promises.stat(abs);
    if (!st.isFile()) return null;
    const lang = pluginFor(loadedPlugins, rel)?.id ?? null;
    const base: FileInfo = { path: rel, lines: 1, bytes: st.size, lang, analyzed: false };
    if (st.size === 0) return { info: { ...base, lines: 1, analyzed: true }, binary: false };
    // Look at the first 8KB: a NUL byte means "this is not text" (images, executables...).
    const fd = await fs.promises.open(abs, 'r');
    let head: Buffer;
    try {
      head = Buffer.alloc(Math.min(8000, st.size));
      await fd.read(head, 0, head.length, 0);
    } finally {
      await fd.close();
    }
    if (head.includes(0)) return { info: base, binary: true };
    // Very large text files: don't read them whole, just estimate (about 40 characters per line).
    if (st.size > config.scan.maxFileBytes) return { info: { ...base, lines: Math.max(1, Math.round(st.size / 40)), analyzed: true }, binary: false };
    const buf = await fs.promises.readFile(abs);
    let lines = 1;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
    if (buf[buf.length - 1] === 10) lines--;
    return { info: { ...base, lines: Math.max(1, lines), analyzed: !lang }, binary: false };
  } catch {
    return null; // deleted while we were reading, or unreadable
  }
}

let loadedPlugins: LanguagePlugin[] = [];

/** Phase 1. */
export async function scanFiles(root: string): Promise<ScanResult> {
  loadedPlugins = await loadLanguages();
  // Prefer git's list (it respects .gitignore). If git has nothing to say (not a repo, or the
  // whole folder is ignored by a parent repo), walk the folder ourselves.
  let list = await gitFiles(root);
  if (!list || list.length === 0) list = await walkFiles(root, config.scan.maxFiles * 2);
  list = [...new Set(list)].filter((f) => !isIgnoredPath(f, root));
  const truncated = list.length > config.scan.maxFiles;
  if (truncated) list = list.slice(0, config.scan.maxFiles);

  const files: FileInfo[] = [];
  let skippedBinary = 0;
  // Read 64 files at a time so a huge project doesn't open thousands of files at once.
  for (let i = 0; i < list.length; i += 64) {
    const results = await Promise.all(list.slice(i, i + 64).map((f) => statFile(root, f)));
    for (const r of results) {
      if (!r) continue;
      if (r.binary) skippedBinary++;
      else files.push(r.info);
    }
  }
  return { files, truncated, skippedBinary };
}

// ---- phase 2 ----------------------------------------------------------------------
export interface Analyzer {
  /** Parse one file and fill in its imports + symbols. */
  analyze: (info: FileInfo) => Promise<FileInfo>;
}

/** Build an analyzer for a project. `fileSet` is read live, so newly added files can be resolved. */
export async function createAnalyzer(root: string, fileSet: Set<string>): Promise<Analyzer> {
  const plugins = await loadLanguages();
  loadedPlugins = plugins;
  const resolvers = new Map<string, Resolver>();
  for (const p of plugins) resolvers.set(p.id, p.createResolver(root, fileSet));

  return {
    async analyze(info) {
      const plugin = plugins.find((p) => p.id === info.lang);
      if (!plugin) return { ...info, analyzed: true };
      let source: string;
      try {
        source = await fs.promises.readFile(path.join(root, info.path), 'utf8');
      } catch {
        return { ...info, analyzed: true };
      }
      const ext = path.extname(info.path).toLowerCase();
      const extracted = await withTree(plugin.grammar(ext), source, (rootNode) => plugin.extract(rootNode)).catch((err) => {
        console.warn(`  [analysis] could not parse ${info.path}:`, String(err?.message ?? err));
        return null;
      });
      if (!extracted) return { ...info, analyzed: true, imports: [], symbols: [] };
      const resolve = resolvers.get(plugin.id)!;
      const imports: ImportInfo[] = extracted.imports.map((i) => ({ ...i, resolved: resolve(i.spec, info.path) }));
      return { ...info, analyzed: true, imports, symbols: extracted.symbols };
    },
  };
}

/** Is this path ignored by .gitignore? (Used for brand-new files the watcher sees.) */
export async function isGitIgnored(root: string, rel: string): Promise<boolean> {
  try {
    await execFileP('git', ['check-ignore', '-q', '--', rel], { cwd: root });
    return true; // exit code 0 = ignored
  } catch {
    return false; // exit code 1 = not ignored (or not a git repo)
  }
}
