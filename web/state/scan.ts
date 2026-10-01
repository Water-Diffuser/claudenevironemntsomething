// ============================================================================
//  scan.ts: the browser's copy of the project scan (files, imports, functions).
//  It has two version counters so panels only redo expensive work when needed:
//    layoutVersion   : the set of files or their sizes changed (the map must re-layout)
//    analysisVersion : imports/functions changed (the graph must rebuild)
// ============================================================================
import { create } from 'zustand';
import type { FileInfo, ProjectScan, ScanPatch } from '@shared/scan';

interface ScanStore {
  root: string | null;
  name: string;
  files: Map<string, FileInfo>;
  truncated: boolean;
  skippedBinary: number;
  /** 0..1: how far the background code analysis has got. */
  progress: number;
  layoutVersion: number;
  analysisVersion: number;
  setScan: (scan: ProjectScan | null) => void;
  applyPatch: (patch: ScanPatch) => void;
}

export const useScan = create<ScanStore>((set, get) => ({
  root: null,
  name: '',
  files: new Map(),
  truncated: false,
  skippedBinary: 0,
  progress: 1,
  layoutVersion: 0,
  analysisVersion: 0,

  setScan(scan) {
    const files = new Map<string, FileInfo>();
    for (const f of scan?.files ?? []) files.set(f.path, f);
    const analyzed = [...files.values()].every((f) => f.analyzed);
    set((s) => ({
      root: scan?.root ?? null,
      name: scan?.name ?? '',
      files,
      truncated: scan?.truncated ?? false,
      skippedBinary: scan?.skippedBinary ?? 0,
      progress: analyzed ? 1 : 0,
      layoutVersion: s.layoutVersion + 1,
      analysisVersion: s.analysisVersion + 1,
    }));
  },

  applyPatch(patch) {
    const { files } = get();
    let layoutChanged = false;
    let analysisChanged = false;
    for (const f of patch.upserts) {
      const old = files.get(f.path);
      if (!old || old.lines !== f.lines) layoutChanged = true;
      if (f.imports || f.symbols || (old && (old.imports || old.symbols))) analysisChanged = true;
      files.set(f.path, f);
    }
    for (const p of patch.removed) if (files.delete(p)) (layoutChanged = true), (analysisChanged = true);
    set((s) => ({
      progress: patch.progress ?? s.progress,
      layoutVersion: s.layoutVersion + (layoutChanged ? 1 : 0),
      analysisVersion: s.analysisVersion + (analysisChanged ? 1 : 0),
    }));
  },
}));
