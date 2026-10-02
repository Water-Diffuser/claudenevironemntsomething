// ============================================================================
//  "Pulse": an ECG heartbeat monitor for Claude.
//    working   a fast, strong beat
//    waiting   a slow resting beat
//    an error  a stuttering, irregular rhythm with noise
//  It is drawn live on a canvas: new samples enter on the right and scroll left.
// ============================================================================
import { useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';
import { readThemeColors, mix } from '../../lib/themeColors';
import { useElementSize } from '../../lib/useElementSize';
import { avatarState, type AvatarState } from '../../components/Avatar';
import { useSettings } from '../../state/settings';
import { getView, useDerived } from '../../state/store';
import { useThemeRev } from '../../theme/themeRev';

const BPM: Record<AvatarState, number> = { idle: 46, thinking: 76, working: 132, done: 64, glitching: 98 };
const LABEL: Record<AvatarState, string> = { idle: 'resting', thinking: 'thinking', working: 'working', done: 'content', glitching: 'arrhythmia!' };
const PX_PER_SEC = 150;

/** A bump centred at `mu` (seconds into the beat). */
const bump = (t: number, mu: number, sigma: number, amp: number) => amp * Math.exp(-((t - mu) ** 2) / (2 * sigma * sigma));

/** One heartbeat: the P wave, the QRS spike, then the T wave. `t` = seconds since the beat began. */
function ecg(t: number): number {
  return bump(t, 0.1, 0.025, 0.14) + bump(t, 0.2, 0.008, -0.12) + bump(t, 0.225, 0.011, 1) + bump(t, 0.255, 0.01, -0.26) + bump(t, 0.4, 0.05, 0.28);
}

export default function HeartbeatPanel() {
  const d = useDerived();
  const calm = useSettings((s) => s.ui.calm);
  const themeRev = useThemeRev((s) => s.rev);
  const { ref: boxRef, width, height } = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const mood = avatarState(d, getView().now);
  const moodRef = useRef<AvatarState>(mood);
  moodRef.current = mood;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const bpmShown = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || width < 40 || height < 40) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = readThemeColors();

    const ys = new Float32Array(Math.ceil(width)).fill(0); // one sample per pixel column, newest on the right
    let bpm = BPM.idle;
    let lastBeat = 0; // time of the last beat start
    let interval = 60 / bpm;
    let t = 0;
    let noiseUntil = 0;
    let last = performance.now();
    let acc = 0;
    let raf = 0;

    const frame = (nowMs: number) => {
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const m = moodRef.current;
      const erratic = m === 'glitching' && !calmRef.current;
      bpm += (BPM[m] - bpm) * Math.min(1, dt * 1.6); // glide towards the new heart rate
      acc += dt * PX_PER_SEC;
      const steps = Math.floor(acc);
      acc -= steps;
      for (let s = 0; s < steps; s++) {
        t += 1 / PX_PER_SEC;
        if (t - lastBeat >= interval) {
          lastBeat = t;
          interval = 60 / bpm;
          if (erratic) {
            interval *= 0.55 + Math.random() * 1.1; // irregular timing
            if (Math.random() < 0.25) noiseUntil = t + 0.5; // a burst of static
            if (Math.random() < 0.12) interval *= 1.8; // a dropped beat
          }
        }
        let y = ecg(t - lastBeat);
        if (m === 'working') y *= 1.1;
        if (m === 'idle') y *= 0.8;
        if (erratic && t < noiseUntil) y += (Math.random() - 0.5) * 0.7;
        ys.copyWithin(0, 1);
        ys[ys.length - 1] = y;
      }

      // ---- draw ----
      ctx.clearRect(0, 0, width, height);
      const mid = height * 0.62;
      const amp = height * 0.5;
      // faint monitor grid
      ctx.strokeStyle = mix(colors.border, 45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 24) (ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, height));
      for (let y = 0; y < height; y += 24) (ctx.moveTo(0, y + 0.5), ctx.lineTo(width, y + 0.5));
      ctx.stroke();
      // the trace, fading out towards the left
      const color = m === 'glitching' ? colors.bad : colors.accent;
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, mix(color, 0));
      grad.addColorStop(0.55, mix(color, 55));
      grad.addColorStop(1, color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = calmRef.current ? 0 : 10;
      ctx.beginPath();
      for (let i = 0; i < ys.length; i++) {
        const y = mid - ys[i] * amp;
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.stroke();
      // the leading dot
      ctx.shadowBlur = calmRef.current ? 0 : 16;
      ctx.fillStyle = colors.text;
      ctx.beginPath();
      ctx.arc(ys.length - 1, mid - ys[ys.length - 1] * amp, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (bpmShown.current) bpmShown.current.textContent = String(Math.round(bpm));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, themeRev]);

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden">
      <canvas ref={canvas} className="absolute left-0 top-0" style={{ width, height }} aria-label={`Heartbeat monitor: ${LABEL[mood]}`} role="img" />
      <div className="pointer-events-none absolute left-3 top-2 flex items-center gap-1.5">
        <Heart size={18} className={mood === 'working' ? 'animate-pulse text-accent' : 'text-accent'} fill="currentColor" />
        <span ref={bpmShown} className="font-mono text-2xl font-semibold leading-none text-ink">
          {BPM[mood]}
        </span>
        <span className="text-xs uppercase tracking-wider text-dim">bpm · {LABEL[mood]}</span>
      </div>
    </div>
  );
}
