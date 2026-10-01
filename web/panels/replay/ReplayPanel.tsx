// ============================================================================
//  "Playback": a scrubber that rewinds the WHOLE dashboard, step by step.
//  Drag the slider, or press play. The map, graph, diff, chat and every other
//  panel show how they looked at that moment. "Live" returns to now.
//  Space = play/pause, arrow keys = step, Home/End = start/live.
// ============================================================================
import { useEffect, useRef } from 'react';
import { Pause, Play, Radio, SkipBack, StepBack, StepForward } from 'lucide-react';
import type { SessionEvent } from '@shared/events';
import { readThemeColors } from '../../lib/themeColors';
import { useElementSize } from '../../lib/useElementSize';
import { goLive, pause, play, seek, setSkipIdle, setSpeed, step, useReplay } from '../../state/replay';
import { useApp } from '../../state/store';
import { useThemeRev } from '../../theme/themeRev';

/** A one-line description of an event, for the "what happened at this step" label. */
function describe(e: SessionEvent | undefined): string {
  if (!e) return 'the very beginning';
  switch (e.kind) {
    case 'user_message':
      return `You: “${e.text.slice(0, 70)}”`;
    case 'assistant_text':
      return `Claude: “${e.text.replace(/\s+/g, ' ').slice(0, 70)}”`;
    case 'tool_start':
      return `${e.tool} ${e.summary}`.slice(0, 90);
    case 'tool_end':
      return e.ok ? 'finished' : 'failed';
    case 'turn_end':
      return e.ok ? 'finished the take' : 'the take stopped with an error';
    case 'notice':
      return e.text.slice(0, 90);
    case 'interrupted':
      return 'stopped mid-song';
    case 'fs_change':
      return `${e.change} ${e.path}`;
    case 'permission':
      return `May I? ${e.tool} (${e.decision})`;
    case 'todos':
      return 'updated the menu';
    default:
      return e.kind.replace('_', ' ');
  }
}

/** The strip of coloured ticks under the slider: one mark per interesting event. */
function Ticks({ events, position }: { events: SessionEvent[]; position: number }) {
  const { ref, el, width } = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const themeRev = useThemeRev((s) => s.rev);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || width < 20) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = 22;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${width}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    const c = readThemeColors();
    const n = Math.max(1, events.length);
    // one slot per pixel column; keep the most important thing in each
    const slot = new Map<number, { color: string; tall: number }>();
    events.forEach((e, i) => {
      let color = '';
      let tall = 0;
      if (e.kind === 'tool_start') (color = c.kind[e.toolKind]), (tall = 12);
      else if (e.kind === 'user_message') (color = c.accent), (tall = 22);
      else if (e.kind === 'tool_end' && !e.ok) (color = c.bad), (tall = 18);
      else if (e.kind === 'turn_end') (color = c.text), (tall = 16);
      else if (e.kind === 'fs_change') (color = c.kind[e.change === 'unlink' ? 'delete' : e.change === 'add' ? 'create' : 'edit']), (tall = 8);
      if (!color) return;
      const x = Math.min(width - 2, Math.floor((i / n) * width));
      const cur = slot.get(x);
      if (!cur || tall > cur.tall) slot.set(x, { color, tall });
    });
    for (const [x, s] of slot) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, h - s.tall, 2, s.tall);
    }
    ctx.globalAlpha = 1;
    // the playhead
    const px = Math.min(width - 1, (position / n) * width);
    ctx.fillStyle = c.accent2;
    ctx.fillRect(px - 1, 0, 2, h);
  }, [events.length, position, width, themeRev, events]);

  return (
    <div ref={ref} className="relative h-[22px] w-full" aria-hidden>
      <canvas ref={canvas} className="absolute left-0 top-0" />
      {el && null}
    </div>
  );
}

export default function ReplayPanel() {
  useApp((s) => s.rev);
  const events = useApp((s) => s.events);
  const { active, index, playing, speed, skipIdle } = useReplay();
  const total = events.length;
  const position = active ? index : total;
  const pending = useRef<number | null>(null);

  // Dragging the slider can fire many events per frame; handle one per animation frame.
  const onSlide = (v: number) => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => ((pending.current = null), seek(v)));
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col justify-center gap-1 px-3 py-1.5 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ') (e.preventDefault(), playing ? pause() : play());
        else if (e.key === 'ArrowRight') (e.preventDefault(), step(1));
        else if (e.key === 'ArrowLeft') (e.preventDefault(), step(-1));
        else if (e.key === 'Home') (e.preventDefault(), seek(0));
        else if (e.key === 'End') (e.preventDefault(), goLive());
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn !p-1.5" onClick={() => seek(0)} disabled={total === 0} title="Back to the start (Home)" aria-label="Back to the start">
          <SkipBack size={15} />
        </button>
        <button className="btn !p-1.5" onClick={() => step(-1)} disabled={total === 0 || position === 0} title="Step back (←)" aria-label="Step back">
          <StepBack size={15} />
        </button>
        <button className="btn btn-primary !p-1.5" onClick={() => (playing ? pause() : play())} disabled={total === 0} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <button className="btn !p-1.5" onClick={() => step(1)} disabled={!active} title="Step forward (→)" aria-label="Step forward">
          <StepForward size={15} />
        </button>
        <select className="field !w-auto !py-0.5 text-xs" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Playback speed">
          {[0.5, 1, 2, 4, 8, 16].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-dim" title="Squash long pauses so playback keeps moving">
          <input type="checkbox" checked={skipIdle} onChange={(e) => setSkipIdle(e.target.checked)} /> skip pauses
        </label>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-dim">
            step {position} / {total}
          </span>
          {active ? (
            <button className="btn btn-primary !px-2 !py-0.5 text-xs" onClick={goLive} title="Back to the present (End)">
              <Radio size={12} /> Live
            </button>
          ) : (
            <span className="chip border-good/60 text-good">
              <span className="inline-block size-1.5 rounded-full bg-good" /> live
            </span>
          )}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(1, total)}
        step={1}
        value={position}
        disabled={total === 0}
        onChange={(e) => onSlide(+e.target.value)}
        className="h-4 w-full cursor-pointer accent-[var(--c-accent)]"
        aria-label="Session position"
        aria-valuetext={`step ${position} of ${total}`}
      />
      <Ticks events={events} position={position} />
      <div className="truncate text-xs text-dim" aria-live="polite">
        {total === 0 ? 'Nothing to replay yet. Run a take first.' : <>at this moment: <span className="text-ink">{describe(events[position - 1])}</span></>}
      </div>
    </div>
  );
}
