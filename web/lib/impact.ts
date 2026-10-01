// ============================================================================
//  impact.ts: "what might break if I change this?"
//  Walks the graph backwards: everything that imports the changed file, and
//  everything that calls the changed functions, then who imports/calls THOSE...
// ============================================================================
import type { CodeGraph } from './codeGraph';

export interface Impact {
  source: { path: string; symbols: string[] };
  /** file path -> how many steps away from the change (1 = imports it directly) */
  fileDepth: Map<string, number>;
  /** symbol id -> steps away (1 = calls it directly) */
  symDepth: Map<string, number>;
  maxDepth: number;
  /** True if we stopped early because the project is huge. */
  capped: boolean;
}

export function computeImpact(g: CodeGraph, path: string, symbolIds: string[] = [], maxDepth = 4, cap = 600): Impact {
  const fileDepth = new Map<string, number>();
  const symDepth = new Map<string, number>();
  let capped = false;

  // ---- files: who imports this file? ---------------------------------------------------
  let frontier = [path];
  const seenFiles = new Set([path]);
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const importer of g.importedBy.get(f) ?? []) {
        if (seenFiles.has(importer)) continue;
        if (seenFiles.size >= cap) {
          capped = true;
          break;
        }
        seenFiles.add(importer);
        fileDepth.set(importer, depth);
        next.push(importer);
      }
    }
    frontier = next;
  }

  // ---- functions: who calls the changed functions? --------------------------------------
  let symFrontier = symbolIds;
  const seenSyms = new Set(symbolIds);
  for (let depth = 1; depth <= maxDepth && symFrontier.length; depth++) {
    const next: string[] = [];
    for (const s of symFrontier) {
      for (const caller of g.callers.get(s) ?? []) {
        if (seenSyms.has(caller)) continue;
        if (seenSyms.size >= cap) {
          capped = true;
          break;
        }
        seenSyms.add(caller);
        symDepth.set(caller, depth);
        next.push(caller);
      }
    }
    symFrontier = next;
  }

  const maxD = Math.max(0, ...fileDepth.values(), ...symDepth.values());
  return { source: { path, symbols: symbolIds }, fileDepth, symDepth, maxDepth: maxD, capped };
}
