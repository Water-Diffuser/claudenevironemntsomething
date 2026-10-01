// ============================================================================
//  The HUD: a strip of game-style meters.
//    The Voice  the avatar and what it is doing right now
//    Fullness   how much of Claude's context window (its "memory") is used
//    The Tab    what this session has cost so far (and the tokens)
//    Stars      Michelin-style rating: one star per few finished menu items
// ============================================================================
import { useEffect, useId, useState } from 'react';
import { config } from '@config';
import { fmtCost, fmtTokens } from '../lib/format';
import { useLabel } from '../state/settings';
import { getView, useDerived } from '../state/store';
import { Avatar, avatarState } from './Avatar';

/** A star that fills from empty to full (`fill` is 0..1). */
function Star({ fill }: { fill: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className={fill >= 1 ? 'drop-shadow-[0_0_6px_var(--c-warn)]' : ''}>
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * Math.max(0, Math.min(1, fill))} height="24" />
        </clipPath>
      </defs>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill="none" strokeWidth="1.4" strokeLinejoin="round" style={{ stroke: 'var(--c-warn)', opacity: 0.55 }} />
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" clipPath={`url(#${id})`} strokeWidth="1.4" strokeLinejoin="round" style={{ fill: 'var(--c-warn)', stroke: 'var(--c-warn)' }} />
    </svg>
  );
}

function Meter({ label, value, text, color, title }: { label: string; value: number; text: string; color: string; title?: string }) {
  return (
    <div className="min-w-[9.5rem] flex-1" title={title}>
      <div className="flex items-baseline justify-between gap-2 text-[0.64rem] uppercase tracking-[0.14em]">
        <span className="text-dim">{label}</span>
        <span className="font-mono normal-case tracking-normal text-ink">{text}</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full border border-line bg-bg/70" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(1.5, Math.min(100, value * 100))}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, var(--c-bg)), ${color})`, boxShadow: `0 0 calc(var(--fx-glow) * 10px) ${color}` }} />
      </div>
    </div>
  );
}

export function HudBar() {
  const d = useDerived();
  const [, setTick] = useState(0);
  const voice = useLabel('voice');
  const fullnessLabel = useLabel('fullness');
  const tabLabel = useLabel('tab');
  const starsLabel = useLabel('stars');

  const view = getView();
  const state = avatarState(d, view.now);

  // The avatar's "done" / "glitching" mood lasts a few seconds, so re-check once it should end.
  useEffect(() => {
    if (state !== 'done' && state !== 'glitching') return;
    const t = setTimeout(() => setTick((n) => n + 1), 6100);
    return () => clearTimeout(t);
  }, [state, d.phaseTs]);

  // Fullness: how much of the context window is used
  const fullness = d.usage.contextTokens / Math.max(1, d.usage.contextWindow);
  const fullColor = fullness >= config.hud.fullnessDanger ? 'var(--c-bad)' : fullness >= config.hud.fullnessWarn ? 'var(--c-warn)' : 'var(--c-accent)';

  // The Tab: cost against a budget
  const budget = config.hud.tabBudgetUsd;
  const tabColor = d.usage.costUsd >= budget ? 'var(--c-bad)' : d.usage.costUsd >= budget * 0.7 ? 'var(--c-warn)' : 'var(--c-accent-2)';

  // Stars: one per N finished menu items (or finished takes, if Claude doesn't use a menu)
  const items = d.served.size > 0 ? d.served.size : d.turnsOk;
  const stars = Math.min(3, items / config.hud.itemsPerStar);

  const running = [...d.calls].reverse().find((c) => c.end === undefined);
  const status: Record<string, string> = {
    idle: 'waiting for a prompt',
    thinking: 'thinking…',
    working: running ? `${running.tool}: ${running.summary}`.slice(0, 60) : 'working…',
    done: 'served! ✨',
    glitching: 'something burned',
  };

  return (
    <div className="gloss flex h-[var(--hud-h)] shrink-0 items-center gap-4 border-b border-line bg-bg-alt/70 px-3">
      <div className="flex min-w-[13rem] max-w-[17rem] items-center gap-2.5">
        <Avatar state={state} size={42} burst={d.phaseTs} />
        <div className="min-w-0 leading-tight">
          <div className="text-[0.64rem] uppercase tracking-[0.16em] text-accent-2">{voice}</div>
          <div className="truncate text-xs" aria-live="polite">
            {status[state]}
          </div>
        </div>
      </div>

      <Meter label={fullnessLabel} value={fullness} color={fullColor} text={`${Math.round(fullness * 100)}% · ${fmtTokens(d.usage.contextTokens)}/${fmtTokens(d.usage.contextWindow)}`} title="How much of Claude's context window (its working memory) is in use. When it fills up, older details get squeezed out." />
      <Meter label={tabLabel} value={d.usage.costUsd / budget} color={tabColor} text={`${fmtCost(d.usage.costUsd)} · ${fmtTokens(d.usage.outputTokens)} out`} title={`What this session has cost so far (budget meter: $${budget.toFixed(2)}). Updates when a take finishes.`} />

      <div className="shrink-0" title={`${items} menu item${items === 1 ? '' : 's'} served. One star per ${config.hud.itemsPerStar}.`}>
        <div className="text-[0.64rem] uppercase tracking-[0.14em] text-dim">{starsLabel}</div>
        <div className="mt-0.5 flex" role="img" aria-label={`${stars.toFixed(1)} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <Star key={i} fill={stars - i} />
          ))}
        </div>
      </div>
    </div>
  );
}
