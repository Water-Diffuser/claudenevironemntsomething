// ============================================================================
//  "Pairings": the dependency graph.
//    FILES view      files are nodes, an arrow means "imports"
//    FUNCTIONS view  functions/classes are nodes, an arrow means "calls"
//  Nodes pulse when Claude reads or edits them, edges glow along the path Claude
//  follows, and the Impact toggle lights up everything that depends on the change.
//  Big projects: folders are folded into single nodes (double-click to open one)
//  and the node count is capped (see config.limits).
// ============================================================================
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Radar, RefreshCw, Sparkles } from 'lucide-react';
import { useElementSize } from '../../lib/useElementSize';
import { config } from '@config';
import { useKindLabels } from '../../state/settings';
import type { Kind } from '@shared/events';
import { kindVar } from '../../components/KindIcon';
import { readThemeColors } from '../../lib/themeColors';
import { useCodeGraph, useImpact } from '../../lib/useImpact';
import { useScan } from '../../state/scan';
import { askExplain } from '../../state/side';
import { getView, send, useApp, useDerived, useView } from '../../state/store';
import { useUI } from '../../state/ui';
import { useThemeRev } from '../../theme/themeRev';
import { layoutGraph, type Positions } from './layout';
import { buildFileGraph, buildFnGraph, functionScope, type GNode, type GraphModel } from './model';
import { FloatingEdge, GNodeView, type GEdgeData, type GFlowNode, type GNodeData } from './nodes';

const nodeTypes = { g: GNodeView };
const edgeTypes = { floating: FloatingEdge };

interface TouchInfo {
  kind: Kind;
  ts: number;
  active: boolean;
}

function GraphInner() {
  const kindLabels = useKindLabels();
  const d = useDerived();
  const files = useScan((s) => s.files);
  const progress = useScan((s) => s.progress);
  const cg = useCodeGraph();
  const { impact } = useImpact();
  const themeRev = useThemeRev((s) => s.rev);
  const selectedFile = useUI((s) => s.selectedFile);
  const selectedSymbol = useUI((s) => s.selectedSymbol);
  const selectFile = useUI((s) => s.selectFile);
  const selectSymbol = useUI((s) => s.selectSymbol);
  const setImpactTarget = useUI((s) => s.setImpactTarget);
  const uiFlash = useUI((s) => s.uiFlash);
  const rf = useReactFlow();
  const { ref: areaRef, width: areaW, height: areaH } = useElementSize<HTMLDivElement>();
  // (rounded, so tiny resizes don't re-run the layout)
  const aspect = areaW > 50 && areaH > 50 ? Math.round((areaW / areaH) * 4) / 4 : 1.4;

  const [level, setLevel] = useState<'files' | 'functions'>('files');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hops, setHops] = useState(1);
  const [impactOn, setImpactOn] = useState(false);

  // ---- which files has Claude touched? (their keys change rarely, so the layout stays calm) ----
  const touchedKey = useMemo(
    () => [...d.touched].filter(([, t]) => t.kind !== 'search').map(([p]) => p).sort().join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.count],
  );
  const touchedPaths = useMemo(() => new Set(touchedKey ? touchedKey.split('|') : []), [touchedKey]);
  const seeds = useMemo(() => {
    const recent = [...d.touched].filter(([, t]) => t.kind !== 'search').sort((a, b) => b[1].ts - a[1].ts).slice(0, 6).map(([p]) => p);
    if (selectedFile) recent.unshift(selectedFile);
    return [...new Set(recent)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchedKey, selectedFile]);

  // While replaying: files created later in the session don't exist yet.
  const replayIndex = useView((s) => s.replay?.index ?? -1);
  const hiddenFiles = useMemo(() => {
    const v = getView();
    if (!v.replaying) return null;
    const out = new Set<string>();
    for (const p of useApp.getState().derived.created) if (!v.derived.created.has(p)) out.add(p);
    return out.size ? out : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayIndex]);

  // ---- 1. the model (which nodes and edges) --------------------------------------------------
  const model: GraphModel & { scopeFiles?: number } = useMemo(() => {
    if (level === 'files') return buildFileGraph(cg, files, { expanded, touched: touchedPaths, hidden: hiddenFiles });
    return buildFnGraph(cg, functionScope(cg, files, seeds, hops), touchedPaths);
  }, [cg, files, level, expanded, hops, touchedPaths, seeds, hiddenFiles]);

  // ---- 2. positions (remembered between updates) -----------------------------------------------
  const prevPositions = useRef<Positions>(new Map());
  const [relayout, setRelayout] = useState(0);
  const positions = useMemo(() => {
    if (relayout < 0) return new Map() as Positions; // (just so relayout is a dependency)
    const p = layoutGraph(model.nodes, model.edges, prevPositions.current, aspect);
    prevPositions.current = p;
    return p;
  }, [model, relayout, aspect]);

  // Fit the view whenever the shape of the graph changes.
  const shapeKey = `${level}:${model.nodes.length}:${model.edges.length}`;
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: 380, maxZoom: 1.3 }), 60);
    return () => clearTimeout(t);
  }, [shapeKey, rf]);

  // ---- 3. how each node / edge looks right now ---------------------------------------------------
  const nodeCache = useRef(new Map<string, { sig: string; node: GFlowNode }>());
  const { rfNodes, rfEdges } = useMemo(() => {
    const now = getView().now;

    // touches per node
    const touch = new Map<string, TouchInfo>();
    const bump = (id: string | undefined, t: TouchInfo) => {
      if (!id) return;
      const cur = touch.get(id);
      if (!cur || t.ts > cur.ts || (t.active && !cur.active)) touch.set(id, t);
    };
    if (level === 'files') {
      for (const [p, t] of d.touched) bump(model.repOf.get(p), { kind: t.kind, ts: t.ts, active: t.active });
    } else {
      for (const n of model.nodes) {
        for (const r of d.regions.get(n.path) ?? []) {
          if (n.sym && r.start <= n.sym.endLine && r.end >= n.sym.startLine) bump(n.id, { kind: r.kind, ts: r.ts, active: r.active });
        }
      }
    }

    // impact per node (0 = changed thing, 1.. = steps away)
    const impactOf = new Map<string, number>();
    if (impact) {
      if (level === 'files') {
        const src = model.repOf.get(impact.source.path);
        if (src) impactOf.set(src, 0);
        for (const [p, depth] of impact.fileDepth) {
          const id = model.repOf.get(p);
          if (id && (!impactOf.has(id) || impactOf.get(id)! > depth)) impactOf.set(id, depth);
        }
      } else {
        for (const id of impact.source.symbols) impactOf.set(id, 0);
        for (const [id, depth] of impact.symDepth) impactOf.set(id, depth);
      }
    }
    // errors: nodes an error pointed at flash red
    const flashOf = new Map<string, number>();
    const uf = useUI.getState().uiFlash;
    for (const f of [...d.flashes.slice(-6), ...(uf ? [uf] : [])]) {
      if (now - f.ts > 4000) continue;
      for (const p of f.paths) {
        if (level === 'files') {
          const id = model.repOf.get(p);
          if (id) flashOf.set(id, f.ts);
        } else for (const n of model.nodes) if (n.path === p) flashOf.set(n.id, f.ts);
      }
    }
    const selId = level === 'files' ? (selectedFile ? model.repOf.get(selectedFile) : undefined) : selectedSymbol?.id;

    const nodes: GFlowNode[] = model.nodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const t = touch.get(n.id);
      const imp = impactOf.get(n.id);
      const dimmed = impactOn && impactOf.size > 0 && imp === undefined;
      const flashTs = flashOf.get(n.id);
      const sig = `${t?.kind}|${t?.ts}|${t?.active}|${imp}|${selId === n.id}|${dimmed}|${Math.round(pos.x)}|${Math.round(pos.y)}|${n.label}|${flashTs}`;
      const cached = nodeCache.current.get(n.id);
      if (cached && cached.sig === sig) return cached.node;
      const data: GNodeData = { node: n, touchKind: t?.kind, touchTs: t?.ts, touchActive: t?.active, impact: impactOn ? imp : undefined, selected: selId === n.id, dimmed, now, flashTs };
      const node: GFlowNode = { id: n.id, type: 'g', position: { x: pos.x - n.w / 2, y: pos.y - n.h / 2 }, data, width: n.w, height: n.h, draggable: false };
      nodeCache.current.set(n.id, { sig, node });
      return node;
    });

    // edge glow: Claude's trail through the files lights up the edges between consecutive files
    const edgeIds = new Set(model.edges.map((e) => e.id));
    const glow = new Map<string, { kind: Kind; ts: number }>();
    const extra: Edge[] = [];
    if (level === 'files') {
      for (const hop of d.trail.slice(-40)) {
        const a = model.repOf.get(hop.from);
        const b = model.repOf.get(hop.to);
        if (!a || !b || a === b) continue;
        const direct = edgeIds.has(`${a}>${b}`) ? `${a}>${b}` : edgeIds.has(`${b}>${a}`) ? `${b}>${a}` : null;
        if (direct) glow.set(direct, { kind: hop.kind, ts: hop.ts });
        else if (now - hop.ts < 25_000) {
          extra.push({ id: `trail:${a}>${b}:${hop.ts}`, source: a, target: b, type: 'floating', data: { weight: 1, trail: true, glowKind: hop.kind, glowTs: hop.ts, now } satisfies GEdgeData });
        }
      }
    }
    const impactedEdge = (e: { source: string; target: string }) => impactOn && impactOf.has(e.source) && impactOf.has(e.target) && (impactOf.get(e.source)! > impactOf.get(e.target)! || impactOf.get(e.target) === 0);
    const edges: Edge[] = model.edges.map((e) => {
      const g = glow.get(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'floating',
        data: { weight: e.weight, weak: e.weak, glowKind: g?.kind, glowTs: g?.ts, impact: impactedEdge(e), dimmed: impactOn && impactOf.size > 0 && !impactedEdge(e), now } satisfies GEdgeData,
      };
    });
    return { rfNodes: nodes, rfEdges: [...edges, ...extra.slice(-8)] };
    // d is updated in place; d.count says when something changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, positions, d.count, impact, impactOn, selectedFile, selectedSymbol, level, uiFlash]);

  // ---- 4. interactions -----------------------------------------------------------------------------
  const onNodeClick = (_: unknown, n: GFlowNode) => {
    const node = n.data.node;
    if (node.kind === 'folder') return;
    if (node.sym) selectSymbol(node.sym);
    else selectFile(node.path);
  };
  const onNodeDoubleClick = (_: unknown, n: GFlowNode) => {
    const node = n.data.node;
    if (node.kind !== 'folder') return;
    setExpanded((s) => new Set(s).add(node.path));
  };

  const colors = useMemo(readThemeColors, [themeRev]);
  const nodeColor = (n: { data?: unknown }) => {
    const dd = n.data as GNodeData | undefined;
    return dd?.touchKind ? colors.kind[dd.touchKind] : colors.border;
  };

  const selectedNode: GNode | undefined = useMemo(() => {
    const id = level === 'files' ? (selectedFile ? model.repOf.get(selectedFile) : undefined) : selectedSymbol?.id;
    return model.nodes.find((n) => n.id === id);
  }, [model, level, selectedFile, selectedSymbol]);

  const hasGraph = model.nodes.length > 0;
  const codeFileCount = useMemo(() => [...files.values()].filter((f) => f.lang).length, [files]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1 text-xs">
        <div className="flex overflow-hidden rounded-[var(--radius)] border border-line" role="group" aria-label="Graph level">
          {(['files', 'functions'] as const).map((l) => (
            <button key={l} onClick={() => setLevel(l)} className={`px-2 py-0.5 font-semibold uppercase tracking-wider ${level === l ? 'bg-accent text-on-accent' : 'text-dim hover:text-ink'}`}>
              {l}
            </button>
          ))}
        </div>
        <button className={`btn btn-ghost !px-1.5 !py-0.5 text-xs ${impactOn ? 'border-accent text-accent-2' : ''}`} aria-pressed={impactOn} onClick={() => setImpactOn((v) => !v)} title="Light up everything that imports or calls what Claude just changed">
          <Radar size={13} /> impact
        </button>
        {level === 'functions' && (
          <span className="inline-flex items-center gap-0.5" title="How many import-steps away from the touched files to include">
            <button className="btn btn-ghost !p-0.5" disabled={hops <= 0} onClick={() => setHops((h) => Math.max(0, h - 1))} aria-label="Narrow">
              <Minus size={12} />
            </button>
            <span className="text-dim">scope {hops}</span>
            <button className="btn btn-ghost !p-0.5" disabled={hops >= 4} onClick={() => setHops((h) => Math.min(4, h + 1))} aria-label="Widen">
              <Plus size={12} />
            </button>
          </span>
        )}
        <button className="btn btn-ghost !p-0.5" onClick={() => (prevPositions.current = new Map(), setRelayout((n) => n + 1))} title="Re-arrange the graph from scratch">
          <RefreshCw size={12} />
        </button>
        {expanded.size > 0 && (
          <button className="chip hover:border-accent" onClick={() => setExpanded(new Set())}>
            fold all
          </button>
        )}
        <span className="ml-auto text-dim">
          {model.nodes.length} nodes · {model.edges.length} links{model.folded ? ' · folders folded (double-click to open)' : ''}
          {model.hidden > 0 ? ` · ${model.hidden} unconnected files hidden` : ''}
          {progress < 1 ? ` · reading code ${Math.round(progress * 100)}%` : ''}
        </span>
      </div>

      <div ref={areaRef} className="relative min-h-0 flex-1">
        {!hasGraph && (
          <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm text-dim">
            {files.size === 0 ? 'Choose a project to see how its files connect.' : progress < 1 ? 'Reading the code…' : codeFileCount === 0 ? 'No JavaScript, TypeScript or Python files found to connect.' : 'No imports between files yet.'}
          </div>
        )}
        <ReactFlow
          className="indulgent-flow"
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={() => (selectFile(null), selectSymbol(null))}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={0.1}
          maxZoom={2.2}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <Background gap={26} size={1} color={colors.border} style={{ opacity: 0.35 }} />
          <Controls showInteractive={false} position="bottom-left" />
          {model.nodes.length > 30 && <MiniMap pannable zoomable nodeColor={nodeColor} maskColor="transparent" style={{ width: 120, height: 80 }} />}
        </ReactFlow>
      </div>

      {selectedNode ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-2 py-1.5 text-xs">
          <span className="min-w-0 truncate font-mono font-semibold text-accent-2">{selectedNode.sym ? `${selectedNode.sym.qname}()` : selectedNode.path}</span>
          {selectedNode.sym && <span className="text-dim">in {selectedNode.path}</span>}
          <span className="ml-auto flex gap-1.5">
            <button
              className="btn !px-2 !py-0.5 text-xs"
              onClick={() =>
                askExplain(send, { path: selectedNode.path, symbol: selectedNode.sym?.qname, startLine: selectedNode.sym?.startLine, endLine: selectedNode.sym?.endLine })
              }
            >
              <Sparkles size={12} /> Explain
            </button>
            <button
              className="btn !px-2 !py-0.5 text-xs"
              onClick={() => {
                setImpactTarget({ path: selectedNode.path, symbolIds: selectedNode.sym ? [selectedNode.sym.id] : [] });
                setImpactOn(true);
              }}
            >
              <Radar size={12} /> What breaks?
            </button>
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 border-t border-line px-2 py-1 text-[0.68rem] text-dim">
          {(['read', 'edit', 'create'] as Kind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm" style={{ background: kindVar(k) }} />
              <span style={{ color: kindVar(k) }} className="font-semibold">
                {kindLabels[k]}
              </span>
            </span>
          ))}
          <span>arrows point from importer to imported · dashed = a guess</span>
        </div>
      )}
    </div>
  );
}

export default function GraphPanel() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
