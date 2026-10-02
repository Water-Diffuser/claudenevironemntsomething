// ============================================================================
//  The HUD: a quiet strip of game-style meters, living in the top bar.
//    The Voice  the little avatar and what it is doing right now
//    Fullness   how much of Claude's context window (its "memory") is used
//    The Tab    what this session has cost so far
//    Stars      Michelin-style rating: one star per few finished menu items
//  Labels live in the tooltips, so the strip stays small.
// ============================================================================
import { Receipt, Utensils } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { config } from '@config';
import { fmtCost, fmtTokens } from '../lib/format';
import { useLabel } from '../state/settings';
import { getView, useDerived } from '../state/store';
import { Avatar, avatarState } from './Avatar';

/** A star that fills from empty to full (`fill` is 0..1). */
function Star({ fill }: { fill: number }) {
  const full = fill >= 1;
  const part = fill > 0 && !full;
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
      <defs>
        <linearGradient id="star-part" x1="0" x2="1" y1="0" y2="0">
          <stop offset={`${Math.round(fill * 100)}%`} stopColor="var(--c-warn)" />
          <stop offset={`${Math.round(fill * 100)}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
        strokeWidth="1.6"
        strokeLinejoin="round"
        style={{ stroke: 'var(--c-warn)', strokeOpacity: full || part ? 1 : 0.35, fill: full ? 'var(--c-warn)' : part ? 'url(#star-part)' : 'none' }}
      />
    </svg>
  );
}

/** A tiny icon, a number, and a thin bar under them. (The name is in the tooltip.) */
function Meter({ label, icon, value, text, color, title }: { label: string; icon: ReactNode; value: number; text: string; color: string; title: string }) {
  return (
    <div className="w-[4.4rem]" title={title}>
      <div className="flex items-center gap-1.5 text-xs leading-none">
        <span className="text-dim">{icon}</span>
        <span className="ml-auto text-ink">{text}</span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-line" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, background: color }} />
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
  const tabColor = d.usage.costUsd >= budget ? 'var(--c-bad)' : d.usage.costUsd >= budget * 0.7 ? 'var(--c-warn)' : 'var(--c-text-dim)';

  // Stars: one per N finished menu items (or finished takes, if Claude doesn't use a menu)
  const items = d.served.size > 0 ? d.served.size : d.turnsOk;
  const stars = Math.min(3, items / config.hud.itemsPerStar);

  const running = [...d.calls].reverse().find((c) => c.end === undefined);
  const status: Record<string, string> = {
    idle: 'waiting for a prompt',
    thinking: 'thinking…',
    working: running ? `${running.tool}: ${running.summary}`.slice(0, 48) : 'working…',
    done: 'served',
    glitching: 'something burned',
  };

  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="flex min-w-0 items-center gap-2" title={`${voice}: ${status[state]}`}>
        <Avatar state={state} size={30} burst={d.phaseTs} />
        <span className="max-w-[13rem] truncate text-xs text-dim max-[1500px]:hidden" aria-live="polite">
          {status[state]}
        </span>
      </div>
      <Meter
        label={fullnessLabel}
        icon={<Utensils size={12} />}
        value={fullness}
        color={fullColor}
        text={`${Math.round(fullness * 100)}%`}
        title={`${fullnessLabel}: ${fmtTokens(d.usage.contextTokens)} of ${fmtTokens(d.usage.contextWindow)} tokens of Claude's context window (its working memory) are in use. When it fills up, older details get squeezed out.`}
      />
      <Meter
        label={tabLabel}
        icon={<Receipt size={12} />}
        value={d.usage.costUsd / budget}
        color={tabColor}
        text={fmtCost(d.usage.costUsd)}
        title={`${tabLabel}: this session has cost ${fmtCost(d.usage.costUsd)} (${fmtTokens(d.usage.outputTokens)} tokens out). The bar fills toward a $${budget.toFixed(2)} budget. Updates when a take finishes.`}
      />
      <div className="flex max-md:hidden" role="img" aria-label={`${starsLabel}: ${stars.toFixed(1)} of 3`} title={`${starsLabel}: ${items} menu item${items === 1 ? '' : 's'} served. One star per ${config.hud.itemsPerStar}.`}>
        {[0, 1, 2].map((i) => (
          <Star key={i} fill={stars - i} />
        ))}
      </div>
    </div>
  );
}
