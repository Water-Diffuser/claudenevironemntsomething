// ============================================================================
//  project.ts: keeps a live picture of the open project.
//  It scans the folder, analyzes the code in the background, and then WATCHES
//  the folder (with chokidar) so the map updates as files change.
// ============================================================================
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { FileInfo, ProjectScan, ScanPatch } from '../../shared/scan.ts';
import type { ServerMsg } from '../../shared/protocol.ts';
import { createAnalyzer, isGitIgnored, isIgnoredPath, scanFiles, statFile, type Analyzer } from './scanner.ts';

export type FsChangeKind = 'add' | 'change' | 'unlink';

export class ProjectService {
  scan: ProjectScan | null = null;
  private files = new Map<string, FileInfo>();
  private fileSet = new Set<string>();
  private analyzer: Analyzer | null = null;
  private watcher: FSWatcher | null = null;
  private root: string | null = null;
  /** Bumped each time a project opens, so a slow old scan can't overwrite a newer one. */
  private generation = 0;
  private pending = new Map<string, FsChangeKind>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private broadcast: (msg: ServerMsg) => void,
    private onFsChange: (rel: string, change: FsChangeKind) => void,
  ) {}

  async open(root: string | null) {
    const gen = ++this.generation;
    await this.watcher?.close();
    this.watcher = null;
    this.scan = null;
    this.files.clear();
    this.fileSet.clear();
    this.pending.clear();
    this.root = root;
    if (!root) return this.broadcast({ t: 'scan', scan: null });

    const started = Date.now();
    const result = await scanFiles(root);
    if (gen !== this.generation) return; // a newer project was opened meanwhile
    for (const f of result.files) {
      this.files.set(f.path, f);
      this.fileSet.add(f.path);
    }
    this.scan = { root, name: path.basename(root), files: result.files, truncated: result.truncated, skippedBinary: result.skippedBinary, scannedAt: Date.now() };
    this.broadcast({ t: 'scan', scan: this.scan });
    console.log(`  [scan] ${result.files.length} files in ${Date.now() - started}ms${result.truncated ? ' (truncated)' : ''}`);

    this.startWatching(root, gen);
    void this.analyzeAll(gen);
  }

  /**
   * Phase 2: parse the code in the background, in small time slices so the server stays responsive
   * (chat streaming must never stutter), and tell the browser about progress a few times a second.
   */
  private async analyzeAll(gen: number) {
    if (!this.root) return;
    this.analyzer = await createAnalyzer(this.root, this.fileSet);
    const todo = [...this.files.values()].filter((f) => !f.analyzed);
    const t0 = Date.now();
    let upserts: FileInfo[] = [];
    let lastYield = performance.now();
    let lastFlush = performance.now();

    const flush = (done: number) => {
      this.syncScan();
      this.broadcast({ t: 'scan_patch', patch: { upserts, removed: [], progress: todo.length ? Math.min(1, done / todo.length) : 1 } });
      upserts = [];
      lastFlush = performance.now();
    };

    for (let i = 0; i < todo.length; i++) {
      if (gen !== this.generation) return;
      const done = await this.analyzer.analyze(todo[i]);
      if (gen !== this.generation) return;
      this.files.set(done.path, done);
      upserts.push(done);
      if (performance.now() - lastYield > 30) {
        await new Promise((r) => setImmediate(r)); // let other work run (like chat streaming)
        lastYield = performance.now();
      }
      if (performance.now() - lastFlush > 300) flush(i + 1);
    }
    flush(todo.length);
    if (todo.length) console.log(`  [analysis] parsed ${todo.length} source files in ${Date.now() - t0}ms`);
  }

  /** Keep `scan.files` in step with the live file map (used for clients that connect later). */
  private syncScan() {
    if (this.scan) this.scan.files = [...this.files.values()];
  }

  // ---- watching -----------------------------------------------------------------
  private startWatching(root: string, gen: number) {
    this.watcher = chokidar.watch(root, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (p: string) => {
        const rel = path.relative(root, p).split(path.sep).join('/');
        return rel !== '' && isIgnoredPath(rel, root);
      },
    });
    const queue = (kind: FsChangeKind) => (abs: string) => {
      if (gen !== this.generation) return;
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (!rel || rel.startsWith('..')) return;
      this.pending.set(rel, kind);
      this.flushTimer ??= setTimeout(() => void this.flush(gen), 150);
    };
    this.watcher.on('add', queue('add')).on('change', queue('change')).on('unlink', queue('unlink'));
    this.watcher.on('error', (err) => console.warn('  [watch] error:', String((err as Error)?.message ?? err)));
  }

  private async flush(gen: number) {
    this.flushTimer = null;
    const changes = [...this.pending.entries()];
    this.pending.clear();
    if (!this.root || gen !== this.generation || changes.length === 0) return;

    // A huge burst (git checkout, npm install...) is cheaper to handle as a fresh scan.
    if (changes.length > 400) {
      for (const [rel, kind] of changes.slice(0, 50)) this.onFsChange(rel, kind);
      return void this.open(this.root);
    }

    const upserts: FileInfo[] = [];
    const removed: string[] = [];
    for (const [rel, kind] of changes) {
      if (kind === 'unlink') {
        if (this.files.delete(rel)) removed.push(rel);
        this.fileSet.delete(rel);
        this.onFsChange(rel, 'unlink');
        continue;
      }
      // A file we don't know yet might be git-ignored (build output, logs...). Skip those.
      if (!this.fileSet.has(rel) && (await isGitIgnored(this.root, rel))) continue;
      const stat = await statFile(this.root, rel);
      if (!stat || stat.binary) continue;
      const info = this.analyzer ? await this.analyzer.analyze(stat.info) : stat.info;
      this.files.set(rel, info);
      this.fileSet.add(rel);
      upserts.push(info);
      this.onFsChange(rel, kind);
    }
    if (upserts.length || removed.length) {
      this.syncScan();
      const patch: ScanPatch = { upserts, removed };
      this.broadcast({ t: 'scan_patch', patch });
    }
  }

  // ---- lookups used by the side questions (explain / sketch) ------------------------
  fileInfo(rel: string): FileInfo | undefined {
    return this.files.get(rel);
  }
  allFiles(): FileInfo[] {
    return [...this.files.values()];
  }
  /** Files that import `rel`. */
  importedBy(rel: string): string[] {
    const out: string[] = [];
    for (const f of this.files.values()) if (f.imports?.some((i) => i.resolved === rel)) out.push(f.path);
    return out;
  }

  async close() {
    this.generation++;
    await this.watcher?.close();
    this.watcher = null;
  }
}
