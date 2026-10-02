// ============================================================================
//  "Piano Roll": every tool call is a NOTE, like in a vocal-synth editor.
//    colour   = what kind of tool (the color code)
//    length   = how long it took
//    row      = which folder it worked in (like the piano keys on the left)
//  Drag to pan, scroll to zoom, double-click to follow the present again.
//  Long pauses are squeezed so the notes stay close together.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { useKindLabels } from '../../state/settings';
import { fmtDuration } from '../../lib/format';
import { mix, readThemeColors } from '../../lib/themeColors';
import { useElementSize } from '../../lib/useElementSize';
import type { CallNote } from '../../state/derived';
import { getView, subscribeView, useDerived } from '../../state/store';
import { useThemeRev } from '../../theme/themeRev';

const KEY_W = 92;
const RULER_H = 18;
const MAX_GAP_MS = 2500;

interface Placed {
  note: CallNote;
  x: number;
  w: number;
  lane: number;
}

export default function PianoRollPanel() {
  const hasNotes = useDerived().calls.length > 0; // (re-renders when the session changes; the canvas itself is drawn from refs)
  const kindLabels = useKindLabels();
  const { ref: boxRef, width, height } = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const themeRev = useThemeRev((s) => s.rev);
  const [follow, setFollow] = useState(true);
  const [pxPerSec, setPxPerSec] = useState(46);
  const [tip, setTip] = useState<{ note: CallNote; x: number; y: number } | null>(null);
  const state = useRef({ scroll: 0, follow: true, pxPerSec: 46, placed: [] as Placed[], lanes: [] as string[], total: 0 });
  state.current.follow = follow;
  state.current.pxPerSec = pxPerSec;
  const raf = useRef(0);

  const draw = useCallback(() => {
    const cv = canvas.current;
    if (!cv || width < 100 || height < 40) return;
    const { derived, now } = getView();
    const st = state.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(width * dpr) || cv.height !== Math.round(height * dpr)) {
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = readThemeColors();

    // ---- lay the notes out on a (gap-squeezed) time axis ----
    const notes = derived.calls;
    const lanes: string[] = [];
    for (const n of notes) if (!lanes.includes(n.lane)) lanes.push(n.lane);
    const pxMs = st.pxPerSec / 1000;
    const placed: Placed[] = [];
    let x = 0;
    let prevEnd: number | null = null;
    let anyActive = false;
    for (const n of notes) {
      const end = n.end ?? Math.max(now, n.start + 200);
      if (n.end === undefined) anyActive = true;
      if (prevEnd !== null) x += Math.min(Math.max(0, n.start - prevEnd), MAX_GAP_MS) * pxMs;
      const w = Math.max(5, (end - n.start) * pxMs);
      placed.push({ note: n, x, w, lane: lanes.indexOf(n.lane) });
      prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
    }
    const total = placed.reduce((m, p) => Math.max(m, p.x + p.w), 0);
    st.placed = placed;
    st.lanes = lanes;
    st.total = total;
    const viewW = width - KEY_W;
    if (st.follow) st.scroll = Math.max(0, total - viewW + 40);
    st.scroll = Math.max(0, Math.min(st.scroll, Math.max(0, total - viewW + 40)));

    // ---- draw ----
    ctx.clearRect(0, 0, width, height);
    const laneH = Math.max(16, Math.min(28, (height - RULER_H) / Math.max(1, lanes.length)));
    // lane stripes (like piano keys)
    for (let i = 0; i < Math.max(lanes.length, 1); i++) {
      const y = RULER_H + i * laneH;
      ctx.fillStyle = i % 2 ? mix(c.surface, 100) : mix(c.bgAlt, 100);
      ctx.fillRect(KEY_W, y, width - KEY_W, laneH);
      // the key
      ctx.fillStyle = i % 2 ? mix(c.text, 12, c.surface) : mix(c.text, 22, c.surface);
      ctx.fillRect(0, y + 0.5, KEY_W - 2, laneH - 1);
      ctx.fillStyle = c.text;
      ctx.font = `600 10px ${c.fontMono}`;
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText((lanes[i] ?? '').slice(0, 13), 6, y + laneH / 2);
      ctx.globalAlpha = 1;
    }

    // notes
    ctx.save();
    ctx.beginPath();
    ctx.rect(KEY_W, 0, viewW, height);
    ctx.clip();
    const t0 = derived.stats.firstTs ?? notes[0]?.start ?? now;
    ctx.font = `10px ${c.fontMono}`;
    let lastLabelX = -999;
    for (const p of placed) {
      const nx = KEY_W + p.x - st.scroll;
      if (nx + p.w < KEY_W || nx > width) continue;
      const ny = RULER_H + p.lane * laneH + 2.5;
      const nh = laneH - 5;
      const color = c.kind[p.note.kind];
      const active = p.note.end === undefined;
      ctx.shadowColor = color;
      ctx.shadowBlur = active ? 14 : 0;
      ctx.fillStyle = color;
      ctx.globalAlpha = active ? 0.65 + 0.3 * Math.sin(now / 130) : 0.92;
      ctx.beginPath();
      ctx.roundRect(nx, ny, p.w, nh, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (p.note.ok === false) {
        ctx.strokeStyle = c.bad;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p.w > 40) {
        ctx.fillStyle = c.bg;
        ctx.fillText(p.note.tool, nx + 4, ny + nh / 2 + 0.5);
      }
      // a time label above the ruler every so often
      if (nx - lastLabelX > 90) {
        lastLabelX = nx;
        ctx.fillStyle = c.textDim;
        ctx.fillText(fmtDuration(p.note.start - t0), nx, 9);
      }
    }
    // the playhead ("now")
    const lastEnd = placed.length ? Math.max(...placed.map((p) => p.x + p.w)) : 0;
    const px = KEY_W + lastEnd - st.scroll;
    ctx.strokeStyle = c.accent2;
    ctx.lineWidth = 2;
    ctx.shadowColor = c.accent2;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(px + 0.5, RULER_H - 2);
    ctx.lineTo(px + 0.5, height);
    ctx.stroke();
    ctx.restore();
    // the ruler line
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H + 0.5);
    ctx.lineTo(width, RULER_H + 0.5);
    ctx.stroke();

    if (anyActive) raf.current = requestAnimationFrame(draw); // keep animating while a note is being "held"
  }, [width, height]);

  const request = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    request();
    return subscribeView(request);
  }, [request, themeRev, pxPerSec, follow]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ---- mouse: pan, zoom, hover ----
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    setPxPerSec((v) => Math.max(8, Math.min(400, v * (e.deltaY < 0 ? 1.15 : 0.87))));
  };
  const noteAt = (mx: number, my: number): Placed | undefined => {
    const st = state.current;
    return [...st.placed].reverse().find((p) => {
      const nx = KEY_W + p.x - st.scroll;
      const laneH = Math.max(16, Math.min(28, (height - RULER_H) / Math.max(1, st.lanes.length)));
      const ny = RULER_H + p.lane * laneH;
      return mx >= nx && mx <= nx + p.w && my >= ny && my <= ny + laneH;
    });
  };
  return (
    <div ref={boxRef} className="relative h-full w-full select-none overflow-hidden">
      <canvas
        ref={canvas}
        style={{ width, height, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={onWheel}
        onDoubleClick={() => setFollow(true)}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, scroll: state.current.scroll };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (drag.current) {
            state.current.scroll = drag.current.scroll - (e.clientX - drag.current.x);
            if (follow && Math.abs(e.clientX - drag.current.x) > 4) setFollow(false);
            request();
          } else {
            const hit = noteAt(e.clientX - r.left, e.clientY - r.top);
            setTip(hit ? { note: hit.note, x: e.clientX - r.left, y: e.clientY - r.top } : null);
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setTip(null)}
        aria-label="Piano roll of tool calls"
        role="img"
      />
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-[18rem] rounded-md border border-line bg-surface/95 px-2 py-1 text-xs shadow-lg" style={{ left: Math.min(tip.x + 12, width - 200), top: Math.max(4, tip.y - 44) }}>
          <b>{tip.note.tool}</b> <span className="text-dim">{kindLabels[tip.note.kind]}</span>
          <div className="truncate font-mono text-dim">{tip.note.summary}</div>
          <div className="text-dim">
            {tip.note.end ? fmtDuration(tip.note.end - tip.note.start) : 'running…'}
            {tip.note.ok === false ? ' · failed' : ''}
          </div>
        </div>
      )}
      {!follow && (
        <button className="btn absolute right-2 top-1 !px-2 !py-0.5 text-xs" onClick={() => setFollow(true)}>
          <Crosshair size={12} /> follow
        </button>
      )}
      {!hasNotes && <div className="empty pointer-events-none absolute inset-0">Every tool call Claude makes shows up here as a note.</div>}
    </div>
  );
}
