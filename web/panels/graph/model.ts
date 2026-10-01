// ============================================================================
//  model.ts: turn the code graph into the nodes and edges the graph panel draws.
//
//  Two levels:
//    FILES      one node per file; an arrow means "imports". If there are too many
//               files, whole folders are folded into one node (double-click to open).
//    FUNCTIONS  one node per function/class/method; an arrow means "calls". Shows only
//               the files near what Claude touched, so it stays readable.
// ============================================================================
import { config } from '@config';
import type { FileInfo } from '@shared/scan';
import type { CodeGraph, SymRef } from '../../lib/codeGraph';

export type GKind = 'file' | 'folder' | 'fn' | 'class' | 'method';

export interface GNode {
  id: string;
  label: string;
  /** Second line, e.g. the file a function lives in. */
  sub?: string;
  kind: GKind;
  /** The file this node is (or lives in), or the folder path for folder nodes. */
  path: string;
  sym?: SymRef;
  /** Folder nodes: how many files are folded inside. */
  files?: number;
  lines?: number;
  w: number;
  h: number;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  /** How many underlying imports/calls this edge stands for. */
  weight: number;
  weak?: boolean;
}

export interface GraphModel {
  nodes: GNode[];
  edges: GEdge[];
  /** Which node represents a given file (the file itself, or the folder it is folded into). */
  repOf: Map<string, string>;
  /** True if some folders are folded. */
  folded: boolean;
  /** Number of files left out (isolated files that don't connect to anything). */
  hidden: number;
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const nodeWidth = (label: string, min = 78) => Math.min(210, Math.max(min, label.length * 6.9 + 36));

// ---- file level -------------------------------------------------------------------------
interface Dir {
  path: string;
  files: string[];
  dirs: Map<string, Dir>;
}

export function buildFileGraph(g: CodeGraph, files: Map<string, FileInfo>, opts: { expanded: Set<string>; touched: Set<string>; hidden?: Set<string> | null }): GraphModel {
  // Which files take part? Any file with an import edge, plus anything Claude touched.
  // Small projects show every code file, even unconnected ones.
  const connected = new Set<string>();
  for (const [a, targets] of g.imports) {
    connected.add(a);
    for (const t of targets) connected.add(t);
  }
  const codeFiles = [...files.values()].filter((f) => f.lang);
  const showAll = codeFiles.length <= 60;
  const included: string[] = [];
  for (const f of files.values()) {
    if (opts.hidden?.has(f.path)) continue; // (replay: this file doesn't exist yet at the chosen moment)
    if (connected.has(f.path) || opts.touched.has(f.path) || (showAll && f.lang)) included.push(f.path);
  }
  const hidden = codeFiles.length - codeFiles.filter((f) => included.includes(f.path)).length;

  // Build a folder tree of the included files.
  const root: Dir = { path: '', files: [], dirs: new Map() };
  for (const p of included) {
    const parts = p.split('/');
    let d = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dp = parts.slice(0, i + 1).join('/');
      let child = d.dirs.get(dp);
      if (!child) d.dirs.set(dp, (child = { path: dp, files: [], dirs: new Map() }));
      d = child;
    }
    d.files.push(p);
  }

  // Folders deeper than `fold` are collapsed into one node, unless you expanded them.
  const countAt = (d: Dir, depth: number, fold: number): number => {
    let n = d.files.length;
    for (const sub of d.dirs.values()) n += depth < fold || opts.expanded.has(sub.path) ? countAt(sub, depth + 1, fold) : 1;
    return n;
  };
  let maxDepth = 0;
  const walkDepth = (d: Dir, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    for (const s of d.dirs.values()) walkDepth(s, depth + 1);
  };
  walkDepth(root, 0);
  let fold = maxDepth + 1;
  while (fold > 0 && countAt(root, 0, fold) > config.limits.graphMaxNodes) fold--;

  const repOf = new Map<string, string>();
  const nodes: GNode[] = [];
  const visit = (d: Dir, depth: number) => {
    for (const p of d.files) {
      const f = files.get(p)!;
      repOf.set(p, p);
      nodes.push({ id: p, label: base(p), sub: d.path || undefined, kind: 'file', path: p, lines: f.lines, w: nodeWidth(base(p)), h: 34 });
    }
    for (const sub of d.dirs.values()) {
      if (depth < fold || opts.expanded.has(sub.path)) visit(sub, depth + 1);
      else {
        const all: string[] = [];
        const collect = (x: Dir) => (all.push(...x.files), x.dirs.forEach(collect));
        collect(sub);
        const id = `dir:${sub.path}`;
        for (const p of all) repOf.set(p, id);
        const label = base(sub.path) + '/';
        nodes.push({ id, label, sub: `${all.length} files`, kind: 'folder', path: sub.path, files: all.length, lines: all.reduce((a, p) => a + (files.get(p)?.lines ?? 0), 0), w: nodeWidth(label, 96), h: 40 });
      }
    }
  };
  visit(root, 0);

  // Edges between visible nodes (several imports between two folders become one thicker edge).
  const agg = new Map<string, GEdge>();
  for (const [a, targets] of g.imports) {
    const ra = repOf.get(a);
    if (!ra) continue;
    for (const t of targets) {
      const rb = repOf.get(t);
      if (!rb || ra === rb) continue;
      const id = `${ra}>${rb}`;
      const e = agg.get(id);
      if (e) e.weight++;
      else agg.set(id, { id, source: ra, target: rb, weight: 1 });
    }
  }
  const edges = thinEdges([...agg.values()], opts.touched, repOf);

  // Drop folder nodes that connect to nothing (they would just float).
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const touchedNodes = new Set([...opts.touched].map((p) => repOf.get(p)).filter(Boolean) as string[]);
  const finalNodes = nodes.filter((n) => linked.has(n.id) || touchedNodes.has(n.id) || (showAll && n.kind === 'file'));
  return { nodes: finalNodes, edges, repOf, folded: nodes.some((n) => n.kind === 'folder'), hidden };
}

/** Keep the graph readable: if there are too many edges, keep the strongest and anything Claude touched. */
function thinEdges(edges: GEdge[], touched: Set<string>, repOf: Map<string, string>): GEdge[] {
  const max = config.limits.graphMaxEdges;
  if (edges.length <= max) return edges;
  const hot = new Set([...touched].map((p) => repOf.get(p)).filter(Boolean) as string[]);
  const score = (e: GEdge) => e.weight + (hot.has(e.source) || hot.has(e.target) ? 1000 : 0);
  return [...edges].sort((a, b) => score(b) - score(a)).slice(0, max);
}

// ---- function level -----------------------------------------------------------------------
/** Files near what Claude touched: the touched files plus everything they import / are imported by, `hops` times. */
export function functionScope(g: CodeGraph, files: Map<string, FileInfo>, seeds: string[], hops: number): Set<string> {
  let start = seeds.filter((s) => g.byFile.has(s));
  if (start.length === 0) {
    // Nothing touched yet: start from the best-connected files.
    start = [...g.byFile.keys()]
      .map((p) => ({ p, score: (g.importedBy.get(p)?.length ?? 0) * 2 + (g.imports.get(p)?.length ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.p);
  }
  const scope = new Set(start);
  let frontier = start;
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const n of [...(g.imports.get(f) ?? []), ...(g.importedBy.get(f) ?? [])]) {
        if (!scope.has(n) && g.byFile.has(n)) (scope.add(n), next.push(n));
      }
    }
    frontier = next;
  }
  void files;
  return scope;
}

export function buildFnGraph(g: CodeGraph, scope: Set<string>, touchedPaths: Set<string>): GraphModel & { scopeFiles: number } {
  let syms: SymRef[] = [];
  for (const p of scope) for (const s of g.byFile.get(p) ?? []) if (s.kind !== 'type') syms.push(s);

  // Only keep symbols that take part in a call relationship (or live in a touched file); then cap by connectedness.
  const degree = (s: SymRef) => (g.callers.get(s.id)?.length ?? 0) + (g.callees.get(s.id)?.length ?? 0);
  const ids = new Set(syms.map((s) => s.id));
  const connected = (s: SymRef) => (g.callees.get(s.id) ?? []).some((c) => ids.has(c)) || (g.callers.get(s.id) ?? []).some((c) => ids.has(c));
  syms = syms.filter((s) => connected(s) || touchedPaths.has(s.path));
  if (syms.length > config.limits.graphMaxFunctionNodes) {
    syms = syms.sort((a, b) => (touchedPaths.has(b.path) ? 1000 : 0) + degree(b) - ((touchedPaths.has(a.path) ? 1000 : 0) + degree(a))).slice(0, config.limits.graphMaxFunctionNodes);
  }
  const keep = new Set(syms.map((s) => s.id));
  const nodes: GNode[] = syms.map((s) => ({
    id: s.id,
    label: s.qname + (s.kind === 'class' ? '' : '()'),
    sub: base(s.path),
    kind: s.kind === 'class' ? 'class' : s.kind === 'method' ? 'method' : 'fn',
    path: s.path,
    sym: s,
    w: nodeWidth(s.qname + '()', 84),
    h: 38,
  }));
  const repOf = new Map<string, string>();
  const edges: GEdge[] = [];
  for (const e of g.callEdges) if (keep.has(e.from) && keep.has(e.to)) edges.push({ id: `${e.from}>${e.to}`, source: e.from, target: e.to, weight: 1, weak: e.weak });
  for (const n of nodes) if (!repOf.has(n.path)) repOf.set(n.path, n.id);
  return { nodes, edges: thinEdges(edges, touchedPaths, repOf), repOf, folded: false, hidden: 0, scopeFiles: scope.size };
}
