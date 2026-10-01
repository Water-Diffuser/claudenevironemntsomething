// ============================================================================
//  "Cut Diagram": the whole project as a zoomable treemap.
//  Folders are regions, files are cells, cell area = lines of code.
//  As Claude works, cells light up in the color code and fade to a glow.
//
//  How the pieces fit:
//    tree.ts   builds the folder tree and the treemap layout (d3-hierarchy)
//    draw.ts   paints one frame onto the <canvas>
//    this file React state, mouse handling, the redraw loop and the zoom animation
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Eye, EyeOff } from 'lucide-react';
import { config } from '@config';
import { KINDS, type Kind } from '@shared/events';
import { kindVar } from '../../components/KindIcon';
import { timeAgo } from '../../lib/format';
import { readThemeColors, type ThemeColors } from '../../lib/themeColors';
import { useDebounced } from '../../lib/useDebounced';
import { useElementSize } from '../../lib/useElementSize';
import { useReplay } from '../../state/replay';
import { useScan } from '../../state/scan';
import { useLabel, useSettings } from '../../state/settings';
import { getView, subscribeView, useApp, useDerived, useView } from '../../state/store';
import { useUI } from '../../state/ui';
import { dur } from '../../theme/motion';
import { useThemeRev } from '../../theme/themeRev';
import { drawMap, hitTest } from './draw';
import { FileCard } from './FileCard';
import { buildTree, computeLayout, findNode, type Cell, type Ghost, type MapLayout, type TNode } from './tree';

interface LayoutPack {
  layout: MapLayout;
  focus: string;
}

/** A zoom animation: two snapshots (before / after) and the rectangle we zoom into or out of. */
interface Transition {
  dir: 'in' | 'out';
  fromFocus: string;
  toFocus: string;
  snap: HTMLCanvasElement;
  newSnap: HTMLCanvasElement | null;
  rect: Cell | null;
  t0: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function MapPanel() {
  const label = useLabel('map');
  const calm = useSettings((s) => s.ui.calm);
  const themeRev = useThemeRev((s) => s.rev);
  const files = useScan((s) => s.files);
  const layoutVersion = useScan((s) => s.layoutVersion);
  const progress = useScan((s) => s.progress);
  const scanName = useScan((s) => s.name);
  const truncated = useScan((s) => s.truncated);
  const cwd = useApp((s) => s.server?.cwd);
  const selected = useUI((s) => s.selectedFile);
  const selectFile = useUI((s) => s.selectFile);

  const { ref: areaRef, el: areaEl, width: rawW, height: rawH } = useElementSize<HTMLDivElement>();
  const width = useDebounced(rawW, 100);
  const height = useDebounced(rawH, 100);

  const [focus, setFocus] = useState('');
  const [dim, setDim] = useState(false);
  const [ghosts, setGhosts] = useState<Map<string, Ghost>>(new Map());
  const [tip, setTip] = useState<{ cell: Cell; x: number; y: number } | null>(null);

  // ---- 1. data -> layout ----------------------------------------------------------
  const knownLines = useRef(new Map<string, number>());
  // While replaying: files Claude created LATER in the session don't exist yet, so leave them out.
  const replayIndex = useView((s) => s.replay?.index ?? -1);
  const hidden = useMemo(() => {
    const v = getView();
    if (!v.replaying) return null;
    const out = new Set<string>();
    for (const p of useApp.getState().derived.created) if (!v.derived.created.has(p)) out.add(p);
    return out.size ? out : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayIndex]);
  const tree: TNode = useMemo(() => {
    knownLines.current = new Map([...files.values()].map((f) => [f.path, f.lines]));
    return buildTree(hidden ? [...files.values()].filter((f) => !hidden.has(f.path)) : files.values(), ghosts, scanName);
    // `files` is mutated in place, so we watch layoutVersion instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion, ghosts, scanName, hidden]);

  const focusNode = useMemo(() => findNode(tree, focus) ?? tree, [tree, focus]);
  const pack: LayoutPack | null = useMemo(() => {
    if (width < 40 || height < 40) return null;
    return { layout: computeLayout(focusNode, width, height), focus };
  }, [focusNode, focus, width, height]);

  // If the folder we were zoomed into disappears (e.g. you switched project), go back to the top.
  useEffect(() => {
    if (focus && !findNode(tree, focus)) setFocus('');
  }, [tree, focus]);
  useEffect(() => setFocus(''), [cwd]);

  // ---- 2. mutable state the draw loop reads -----------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const packRef = useRef<LayoutPack | null>(null);
  const colorsRef = useRef<ThemeColors | null>(null);
  const hoverRef = useRef<Cell | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dimRef = useRef(false);
  const calmRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const trRef = useRef<Transition | null>(null);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFrame = useRef(0);
  const uiFlash = useUI((s) => s.uiFlash);
  const uiFlashRef = useRef<{ ts: number; paths: string[] } | null>(null);
  useEffect(() => {
    uiFlashRef.current = uiFlash;
    requestDraw();
  }, [uiFlash]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 3. the redraw loop -----------------------------------------------------------
  const frame = useCallback(() => {
    const cv = canvasRef.current;
    const pk = packRef.current;
    const colors = colorsRef.current;
    if (!cv || !pk || !colors) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const view = getView();

    const paint = (target: CanvasRenderingContext2D, layout: MapLayout, withHover: boolean) =>
      drawMap({
        ctx: target,
        width: w,
        height: h,
        layout,
        colors,
        touched: view.derived.touched,
        now: view.now,
        selected: selectedRef.current,
        hover: withHover ? hoverRef.current : null,
        dimUntouched: dimRef.current,
        calm: calmRef.current,
        commandRunning: [...view.derived.running.values()].includes('run'),
        flashes: uiFlashRef.current ? [...view.derived.flashes.slice(-6), uiFlashRef.current] : view.derived.flashes.slice(-6),
      });

    let delay: number | null = null;
    const tr = trRef.current;
    if (tr && tr.toFocus === pk.focus) {
      // A zoom animation: render the new view once into a hidden canvas, then slide between the two pictures.
      if (!tr.newSnap) {
        const off = document.createElement('canvas');
        off.width = cv.width;
        off.height = cv.height;
        const octx = off.getContext('2d')!;
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paint(octx, pk.layout, false);
        tr.newSnap = off;
        tr.t0 = performance.now();
        if (tr.dir === 'out') {
          const node = findNode(treeRef.current, tr.fromFocus);
          tr.rect = node ? pk.layout.byPath.get(node.path) ?? null : null;
        }
      }
      const p = Math.min(1, (performance.now() - tr.t0) / (dur(0.34) * 1000 || 1));
      if (!tr.rect || p >= 1) {
        trRef.current = null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        delay = paint(ctx, pk.layout, true);
      } else {
        const e = ease(p);
        const R = tr.rect;
        const rw = R.x1 - R.x0;
        const rh = R.y1 - R.y0;
        const from = tr.dir === 'in' ? { x: 0, y: 0, w, h } : { x: R.x0, y: R.y0, w: rw, h: rh };
        const to = tr.dir === 'in' ? { x: R.x0, y: R.y0, w: rw, h: rh } : { x: 0, y: 0, w, h };
        const vx = lerp(from.x, to.x, e);
        const vy = lerp(from.y, to.y, e);
        const sx = w / lerp(from.w, to.w, e);
        const sy = h / lerp(from.h, to.h, e);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = colors.bgAlt;
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.setTransform(dpr * sx, 0, 0, dpr * sy, -dpr * vx * sx, -dpr * vy * sy);
        if (tr.dir === 'in') {
          ctx.drawImage(tr.snap, 0, 0, w, h);
          ctx.globalAlpha = e;
          ctx.drawImage(tr.newSnap, R.x0, R.y0, rw, rh);
        } else {
          ctx.drawImage(tr.newSnap, 0, 0, w, h);
          ctx.globalAlpha = 1 - e;
          ctx.drawImage(tr.snap, R.x0, R.y0, rw, rh);
        }
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        delay = 0;
      }
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      delay = paint(ctx, pk.layout, true);
    }

    lastFrame.current = performance.now();
    clearTimeout(timer.current);
    if (view.replaying && useReplay.getState().playing) delay = 0; // keep fading while a replay plays
    if (delay === 0) timer.current = setTimeout(() => requestDraw(), Math.max(0, 33 - (performance.now() - lastFrame.current)));
    else if (delay !== null) timer.current = setTimeout(() => requestDraw(), delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestDraw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      frame();
    });
  }, [frame]);

  const treeRef = useRef<TNode>(tree);
  treeRef.current = tree;

  // Keep the refs in step with React state, and redraw.
  useEffect(() => {
    packRef.current = pack;
    requestDraw();
  }, [pack, requestDraw]);
  useEffect(() => {
    colorsRef.current = readThemeColors();
    requestDraw();
  }, [themeRev, requestDraw]);
  useEffect(() => {
    selectedRef.current = selected;
    dimRef.current = dim;
    calmRef.current = calm;
    requestDraw();
  }, [selected, dim, calm, requestDraw]);

  // Size the canvas (sharp on high-DPI screens).
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || width < 40 || height < 40) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    sizeRef.current = { w: width, h: height, dpr };
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    cv.style.width = `${width}px`;
    cv.style.height = `${height}px`;
    requestDraw();
  }, [width, height, requestDraw]);

  // Redraw whenever Claude's activity changes, and work out "ghost" cells
  // (files Claude created that the scanner hasn't seen yet, or just deleted).
  useEffect(() => {
    let lastSig = '';
    const update = () => {
      const { derived, now } = getView();
      const next = new Map<string, Ghost>();
      const f = useScan.getState().files;
      for (const [p, t] of derived.touched) {
        if (p === '.' || p === '' || f.has(p)) continue;
        if (t.kind === 'create' || t.kind === 'edit') next.set(p, { kind: 'create', lines: t.lines ?? 20 });
        else if (t.kind === 'delete' && now - t.ts < 90_000 && !derived.touched.has(`${p}/`)) next.set(p, { kind: 'delete', lines: knownLines.current.get(p) ?? 8 });
      }
      const sig = [...next].map(([p, g]) => `${p}:${g.kind}`).sort().join('|');
      if (sig !== lastSig) {
        lastSig = sig;
        setGhosts(next);
      }
      requestDraw();
    };
    update();
    // Re-check when Claude's activity changes AND when the file list changes (on a fresh page load the
    // events can arrive before the scan, which would make every touched file look "not on disk").
    const unsubView = subscribeView(update);
    const unsubScan = useScan.subscribe((s, p) => s.layoutVersion !== p.layoutVersion && update());
    return () => (unsubView(), unsubScan());
  }, [requestDraw]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0; // (otherwise requestDraw thinks a frame is still pending after a remount)
      clearTimeout(timer.current);
    },
    [],
  );

  // ---- 4. zooming ----------------------------------------------------------------------
  const zoomTo = useCallback(
    (path: string) => {
      if (path === focus) return;
      const cv = canvasRef.current;
      const pk = packRef.current;
      if (cv && pk && !calm && dur(1) > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const snap = document.createElement('canvas');
        snap.width = cv.width;
        snap.height = cv.height;
        snap.getContext('2d')!.drawImage(cv, 0, 0);
        const deeper = path.startsWith(focus ? focus + '/' : '');
        const node = deeper ? findNode(tree, path) : null;
        trRef.current = { dir: deeper ? 'in' : 'out', fromFocus: focus, toFocus: path, snap, newSnap: null, rect: node ? pk.layout.byPath.get(node.path) ?? null : null, t0: 0 };
      }
      setFocus(path);
      selectFile(null);
    },
    [focus, calm, tree, selectFile],
  );

  const zoomOut = useCallback(() => {
    if (!focus) return;
    const i = focus.lastIndexOf('/');
    zoomTo(i < 0 ? '' : focus.slice(0, i));
  }, [focus, zoomTo]);

  // Mouse wheel: scroll in to zoom into the folder under the cursor, scroll out to go up.
  const lastWheel = useRef(0);
  useEffect(() => {
    const el = areaEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Date.now() - lastWheel.current < 380) return;
      lastWheel.current = Date.now();
      if (e.deltaY > 0) return zoomOut();
      const pk = packRef.current;
      if (!pk) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // the folder at depth 1 (a direct child of the current view) under the cursor
      const target = pk.layout.cells.find((c) => c.depth === 1 && c.node.isDir && x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1);
      if (target) zoomTo(target.node.path);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [areaEl, zoomOut, zoomTo]);

  // ---- 5. mouse -------------------------------------------------------------------------
  const tipFrame = useRef(0);
  const onMove = (e: React.MouseEvent) => {
    const pk = packRef.current;
    if (!pk) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const cell = hitTest(pk.layout, x, y);
    if (cell !== hoverRef.current) {
      hoverRef.current = cell;
      requestDraw();
    }
    // update the tooltip at most once per animation frame
    cancelAnimationFrame(tipFrame.current);
    tipFrame.current = requestAnimationFrame(() => setTip(cell ? { cell, x, y } : null));
  };
  const onLeave = () => {
    hoverRef.current = null;
    cancelAnimationFrame(tipFrame.current);
    setTip(null);
    requestDraw();
  };
  const onClick = (e: React.MouseEvent) => {
    const pk = packRef.current;
    if (!pk) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cell = hitTest(pk.layout, e.clientX - r.left, e.clientY - r.top);
    if (!cell) return;
    if (cell.node.isDir) zoomTo(cell.node.path);
    else if (!cell.node.dust) selectFile(cell.node.path);
  };

  // ---- 6. the UI around the canvas ---------------------------------------------------------
  const crumbs = focus ? focus.split('/') : [];
  const stats = useMemo(() => {
    let lines = 0;
    for (const f of files.values()) lines += f.lines;
    return { count: files.size, lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion]);

  // How many files are currently lit, per kind (for the legend). Re-renders as Claude works.
  const d = useDerived();
  const litCounts: Partial<Record<Kind, number>> = {};
  for (const t of d.touched.values()) litCounts[t.kind] = (litCounts[t.kind] ?? 0) + 1;

  if (!cwd) return <div className="grid h-full place-items-center p-6 text-center text-dim">Choose a project to see its {label.toLowerCase()}.</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* breadcrumb + controls */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 py-1 text-xs">
        <button className="btn btn-ghost !p-1" disabled={!focus} onClick={zoomOut} title="Zoom out (scroll down)" aria-label="Zoom out">
          <ArrowUp size={14} />
        </button>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap font-mono" aria-label="Folder path">
          <button className="text-accent-2 hover:underline" onClick={() => zoomTo('')}>
            {scanName || 'project'}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-dim">/</span>
              <button className="hover:underline" onClick={() => zoomTo(crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </button>
            </span>
          ))}
        </nav>
        <button className={`btn btn-ghost !px-1.5 !py-0.5 text-xs ${dim ? 'border-accent' : ''}`} onClick={() => setDim((d) => !d)} title="Fade out files Claude hasn't touched" aria-pressed={dim}>
          {dim ? <EyeOff size={13} /> : <Eye size={13} />} focus
        </button>
      </div>

      {/* the canvas */}
      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-hidden" onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
        <canvas ref={canvasRef} className="absolute left-0 top-0 block" style={{ cursor: tip ? 'pointer' : 'default' }} />
        {files.size === 0 && <div className="absolute inset-0 grid place-items-center text-dim">{useScan.getState().root ? 'No files found.' : 'Cutting up the project…'}</div>}
        {tip && <Tooltip tip={tip} bounds={{ w: width, h: height }} />}
        {selected && <FileCard path={selected} onClose={() => selectFile(null)} />}
      </div>

      {/* legend: the color code */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-2 py-1.5 text-[0.7rem]">
        {KINDS.filter((k) => k !== 'other').map((k: Kind) => (
          <span key={k} className="inline-flex items-center gap-1" title={`${config.kindLabels[k]}: ${litCounts[k] ?? 0} files lit`}>
            <span className="inline-block size-2.5 rounded-sm" style={{ background: kindVar(k) }} />
            <span style={{ color: kindVar(k) }} className="font-semibold tracking-wide">
              {config.kindLabels[k]}
            </span>
            {!!litCounts[k] && <span className="text-dim">{litCounts[k]}</span>}
          </span>
        ))}
        <span className="ml-auto text-dim">
          {stats.count.toLocaleString()} files · {stats.lines.toLocaleString()} lines{truncated ? ' (truncated)' : ''}
          {progress < 1 && ` · reading code ${Math.round(progress * 100)}%`}
        </span>
      </div>
    </div>
  );
}

function Tooltip({ tip, bounds }: { tip: { cell: Cell; x: number; y: number }; bounds: { w: number; h: number } }) {
  const { cell } = tip;
  const n = cell.node;
  const t = getView().derived.touched.get(n.path);
  const left = Math.min(tip.x + 14, bounds.w - 220);
  const top = Math.min(tip.y + 14, bounds.h - 90);
  const subtree = (x: TNode): number => (x.children ? x.children.reduce((a, c) => a + subtree(c), 0) : x.value);
  return (
    <div className="pointer-events-none absolute z-20 max-w-[16rem] rounded-md border border-line bg-surface/95 px-2.5 py-1.5 text-xs shadow-lg" style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
      <div className="break-all font-mono font-semibold text-accent-2">{n.path || n.name}</div>
      <div className="text-dim">
        {n.isDir ? `folder · ${subtree(n).toLocaleString()} lines` : n.dust ? `${n.dust} small files · ${n.value} lines` : n.ghost ? 'not on disk' : `${n.file?.lines.toLocaleString()} lines${n.file?.lang ? ' · ' + n.file.lang : ''}`}
      </div>
      {t && (
        <div className="mt-0.5" style={{ color: kindVar(t.kind) }}>
          {config.kindLabels[t.kind]} {timeAgo(t.ts)}
          {t.count > 1 ? ` · ${t.count}×` : ''}
        </div>
      )}
      <div className="mt-0.5 text-dim">{n.isDir ? 'click to zoom in' : n.dust ? '' : 'click for details'}</div>
    </div>
  );
}
