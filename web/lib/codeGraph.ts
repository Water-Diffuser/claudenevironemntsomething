// ============================================================================
//  codeGraph.ts: who imports whom, and who calls whom.
//  Built from the scan's `imports` and `symbols`. Used by the dependency graph
//  (Pairings), the impact view (Ripples) and the explain panel (Liner Notes).
// ============================================================================
import type { FileInfo, SymbolInfo, SymbolKind } from '@shared/scan';

export interface SymRef {
  /** "path#Class.method" */
  id: string;
  path: string;
  name: string;
  /** Qualified name: "Class.method" for methods, otherwise the plain name. */
  qname: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  exported: boolean;
}

export interface CallEdge {
  from: string;
  to: string;
  /** A guess (matched by method name only), drawn dashed. */
  weak: boolean;
}

export interface CodeGraph {
  /** file -> project files it imports */
  imports: Map<string, string[]>;
  /** file -> project files that import it */
  importedBy: Map<string, string[]>;
  symbols: Map<string, SymRef>;
  byFile: Map<string, SymRef[]>;
  callEdges: CallEdge[];
  /** symbol -> symbols that call it */
  callers: Map<string, string[]>;
  callees: Map<string, string[]>;
}

const symId = (path: string, s: SymbolInfo) => `${path}#${s.parent ? s.parent + '.' : ''}${s.name}`;

function toRef(path: string, s: SymbolInfo): SymRef {
  return { id: symId(path, s), path, name: s.name, qname: s.parent ? `${s.parent}.${s.name}` : s.name, kind: s.kind, startLine: s.startLine, endLine: s.endLine, exported: s.exported };
}

let cache: { files: Map<string, FileInfo>; version: number; graph: CodeGraph } | null = null;

/** Build (or reuse) the graph. `version` is the scan's analysisVersion: it changes when the code analysis changes. */
export function getCodeGraph(files: Map<string, FileInfo>, version: number): CodeGraph {
  if (cache && cache.files === files && cache.version === version) return cache.graph;
  const graph = buildCodeGraph(files);
  cache = { files, version, graph };
  return graph;
}

export function buildCodeGraph(files: Map<string, FileInfo>): CodeGraph {
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const symbols = new Map<string, SymRef>();
  const byFile = new Map<string, SymRef[]>();
  const byName = new Map<string, SymRef[]>();

  // ---- 1. import edges + symbol index ------------------------------------------------
  for (const f of files.values()) {
    const targets = [...new Set((f.imports ?? []).map((i) => i.resolved).filter((r): r is string => !!r && r !== f.path && files.has(r)))];
    if (targets.length) imports.set(f.path, targets);
    for (const t of targets) {
      const list = importedBy.get(t) ?? [];
      list.push(f.path);
      importedBy.set(t, list);
    }
    const refs = (f.symbols ?? []).map((s) => toRef(f.path, s));
    if (refs.length) byFile.set(f.path, refs);
    for (const r of refs) {
      symbols.set(r.id, r);
      const l = byName.get(r.name) ?? [];
      l.push(r);
      byName.set(r.name, l);
    }
  }

  // ---- 2. call edges ------------------------------------------------------------------
  const callEdges: CallEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string, weak: boolean) => {
    if (from === to) return;
    const key = `${from}>${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    callEdges.push({ from, to, weak });
  };

  /** Find a top-level symbol named `name` in `file`, following re-exports (export { x } from './y') a few steps. */
  const lookup = (file: string, name: string, depth = 0): SymRef | null => {
    const list = byFile.get(file) ?? [];
    let hit = list.find((s) => s.qname === name && s.kind !== 'method');
    if (!hit && name === 'default') hit = list.find((s) => s.name === 'default') ?? list.filter((s) => s.exported && s.kind !== 'method' && s.kind !== 'type')[0];
    if (hit) return hit;
    if (depth < 3) {
      for (const imp of files.get(file)?.imports ?? []) {
        if (imp.kind !== 'reexport' || !imp.resolved) continue;
        const b = imp.bindings.find((x) => x.local === name);
        if (b) return lookup(imp.resolved, b.imported, depth + 1);
        if (imp.bindings.length === 0) {
          const viaStar = lookup(imp.resolved, name, depth + 1); // export * from './y'
          if (viaStar) return viaStar;
        }
      }
    }
    return null;
  };

  for (const f of files.values()) {
    if (!f.symbols?.length) continue;
    const bindings = new Map<string, { file: string; imported: string }>();
    for (const imp of f.imports ?? []) if (imp.resolved) for (const b of imp.bindings) bindings.set(b.local, { file: imp.resolved, imported: b.imported });
    const local = byFile.get(f.path) ?? [];

    for (const s of f.symbols) {
      const from = symId(f.path, s);
      for (const c of s.calls) {
        let target: SymRef | null = null;
        let weak = false;

        if (!c.receiver) {
          target = local.find((x) => x.qname === c.name && x.kind !== 'method') ?? null;
          const b = bindings.get(c.name);
          if (!target && b && b.imported !== '*') target = lookup(b.file, b.imported);
        } else if (c.receiver === 'this' || c.receiver === 'self' || c.receiver === 'cls') {
          if (s.parent) target = local.find((x) => x.qname === `${s.parent}.${c.name}`) ?? null;
        } else {
          const b = bindings.get(c.receiver);
          if (b) {
            if (b.imported === '*') target = lookup(b.file, c.name); // namespace: ns.fn()
            else target = (byFile.get(b.file) ?? []).find((x) => x.qname === `${b.imported}.${c.name}`) ?? lookup(b.file, c.name); // Class.method() or obj.fn()
          } else {
            target = local.find((x) => x.qname === `${c.receiver}.${c.name}`) ?? null; // SameFileClass.method()
          }
        }

        // A method called on some object (usr.save()): if exactly one method in the project has that name, guess it.
        if (!target && c.receiver) {
          const candidates = (byName.get(c.name) ?? []).filter((x) => x.kind === 'method' || x.kind === 'function');
          if (candidates.length === 1) (target = candidates[0]), (weak = true);
        }
        if (target) addEdge(from, target.id, weak);
      }
    }
  }

  const callers = new Map<string, string[]>();
  const callees = new Map<string, string[]>();
  for (const e of callEdges) {
    (callers.get(e.to) ?? callers.set(e.to, []).get(e.to)!).push(e.from);
    (callees.get(e.from) ?? callees.set(e.from, []).get(e.from)!).push(e.to);
  }
  return { imports, importedBy, symbols, byFile, callEdges, callers, callees };
}

/** Which functions/classes of `path` overlap any of the given line ranges? (1-based, inclusive) */
export function symbolsOverlapping(g: CodeGraph, path: string, ranges: Array<[number, number]>): SymRef[] {
  const out: SymRef[] = [];
  for (const s of g.byFile.get(path) ?? []) {
    if (s.kind === 'type') continue;
    if (ranges.some(([a, b]) => a <= s.endLine && b >= s.startLine)) out.push(s);
  }
  // Prefer the innermost: drop a class if one of its methods is in the list.
  return out.filter((s) => !(s.kind === 'class' && out.some((o) => o.kind === 'method' && o.qname.startsWith(s.name + '.'))));
}
