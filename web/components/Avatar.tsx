// ============================================================================
//  The Voice: the little status avatar (an original design: a glossy orb in a
//  vocal-synth headset). Its face changes with what Claude is doing:
//    idle       calm, blinking, floating
//    thinking   eyes up, a thought bubble, slow pulse
//    working    narrowed eyes, the mouth is a live waveform, a spinning halo
//    done       happy eyes, big smile, sparkles
//    glitching  X eyes, jagged mouth, RGB-split jitter (something failed)
// ============================================================================
import type { Derived } from '../state/derived';

export type AvatarState = 'idle' | 'thinking' | 'working' | 'done' | 'glitching';

/** The avatar celebrates / glitches for a few seconds after a take ends, then settles. */
export function avatarState(d: Derived, now: number): AvatarState {
  if (d.phase === 'error' && now - d.phaseTs < 6000) return 'glitching';
  if (d.phase === 'done' && now - d.phaseTs < 5000) return 'done';
  if (d.phase === 'working') return 'working';
  if (d.phase === 'thinking') return 'thinking';
  return 'idle';
}

export function Avatar({ state, size = 44, burst = 0 }: { state: AvatarState; size?: number; /** change this number to replay the sparkles */ burst?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`avatar avatar-${state}`} role="img" aria-label={`The Voice is ${state}`}>
      <defs>
        <radialGradient id="av-body" cx="0.35" cy="0.28" r="0.95">
          <stop offset="0" style={{ stopColor: 'var(--c-accent-2)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--c-accent)' }} />
          <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--c-accent) 55%, var(--c-shade))' }} />
        </radialGradient>
      </defs>

      {/* spinning halo (only while working) */}
      <circle className="halo" cx="50" cy="52" r="46" fill="none" strokeWidth="2" strokeDasharray="4 7" style={{ stroke: 'var(--c-accent-2)' }} />

      {/* headset: band, ear cups, mic */}
      <path d="M14 52 C14 18 86 18 86 52" fill="none" strokeWidth="4.5" strokeLinecap="round" style={{ stroke: 'var(--c-accent-2)' }} />
      <rect x="8" y="44" width="10" height="20" rx="5" style={{ fill: 'var(--c-accent-2)' }} />
      <rect x="82" y="44" width="10" height="20" rx="5" style={{ fill: 'var(--c-accent-2)' }} />
      <path d="M13 62 C16 78 28 80 36 76" fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--c-accent-2)' }} />
      <circle cx="37" cy="76" r="3.4" style={{ fill: 'var(--c-accent-2)' }} />

      {/* body */}
      <circle cx="50" cy="53" r="35" fill="url(#av-body)" />
      <ellipse cx="38" cy="36" rx="14" ry="8" transform="rotate(-25 38 36)" style={{ fill: 'var(--c-light)' }} opacity="0.32" />

      {/* blush */}
      <g className="blush" opacity="0.5">
        <circle cx="31" cy="61" r="5" style={{ fill: 'var(--c-accent-2)' }} />
        <circle cx="69" cy="61" r="5" style={{ fill: 'var(--c-accent-2)' }} />
      </g>

      {/* eyes (one set per mood; CSS shows the right one) */}
      <g className="eyes">
        <g className="eyes-open">
          <rect x="35.5" y="43" width="8" height="13" rx="4" style={{ fill: 'var(--c-on-accent)' }} />
          <rect x="56.5" y="43" width="8" height="13" rx="4" style={{ fill: 'var(--c-on-accent)' }} />
          <circle cx="38" cy="46.5" r="1.8" style={{ fill: 'var(--c-light)' }} />
          <circle cx="59" cy="46.5" r="1.8" style={{ fill: 'var(--c-light)' }} />
        </g>
        <g className="eyes-narrow">
          <rect x="34.5" y="47" width="10" height="6" rx="3" style={{ fill: 'var(--c-on-accent)' }} />
          <rect x="55.5" y="47" width="10" height="6" rx="3" style={{ fill: 'var(--c-on-accent)' }} />
        </g>
        <g className="eyes-happy" fill="none" strokeWidth="3.4" strokeLinecap="round" style={{ stroke: 'var(--c-on-accent)' }}>
          <path d="M34.5 53 Q39.5 44 44.5 53" />
          <path d="M55.5 53 Q60.5 44 65.5 53" />
        </g>
        <g className="eyes-x" fill="none" strokeWidth="3.2" strokeLinecap="round" style={{ stroke: 'var(--c-on-accent)' }}>
          <path d="M35 44 L44 54 M44 44 L35 54 M56 44 L65 54 M65 44 L56 54" />
        </g>
      </g>

      {/* mouths */}
      <g className="mouths" fill="none" strokeWidth="3.2" strokeLinecap="round" style={{ stroke: 'var(--c-on-accent)' }}>
        <path className="mouth-idle" d="M43 67 Q50 72 57 67" />
        <ellipse className="mouth-think" cx="50" cy="68" rx="3.4" ry="4" />
        <path className="mouth-done" d="M38 64 Q50 80 62 64 Z" style={{ fill: 'var(--c-on-accent)' }} />
        <path className="mouth-glitch" d="M40 69 L45 64 L50 71 L55 64 L60 69" />
        <g className="mouth-wave" strokeWidth="3.6">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} className="bar" x1={41 + i * 4.5} x2={41 + i * 4.5} y1="63" y2="73" style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </g>
      </g>

      {/* thought bubble (thinking) */}
      <g className="thought" style={{ fill: 'var(--c-accent-2)' }}>
        <circle cx="86" cy="22" r="2.4" />
        <circle cx="92" cy="13" r="3.4" />
        <circle cx="98" cy="2" r="4.6" />
      </g>

      {/* sparkles (done). The key makes them play again each time. */}
      <g className="sparkles" key={burst} style={{ fill: 'var(--c-warn)' }}>
        {[
          [14, 20, 0],
          [88, 28, 0.15],
          [78, 6, 0.3],
        ].map(([x, y, delay], i) => (
          <path key={i} className="spark" d={`M${x} ${y - 6} L${x + 1.8} ${y - 1.8} L${x + 6} ${y} L${x + 1.8} ${y + 1.8} L${x} ${y + 6} L${x - 1.8} ${y + 1.8} L${x - 6} ${y} L${x - 1.8} ${y - 1.8} Z`} style={{ animationDelay: `${delay}s` }} />
        ))}
      </g>
    </svg>
  );
}
