// ============================================================================
//  "The Receipt": the session's numbers, printed on a little till receipt.
//  (The paper is the theme's text color, the ink is its background color.)
// ============================================================================
import { fmtCost, fmtDuration, fmtTokens } from '../../lib/format';
import { useDerived } from '../../state/store';
import { useLabel } from '../../state/settings';
import { config } from '@config';

function Line({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span>{label}</span>
      <span className="min-w-3 flex-1 border-b border-dotted" style={{ borderColor: 'color-mix(in srgb, var(--c-bg) 45%, transparent)' }} aria-hidden />
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function StatsPanel() {
  const d = useDerived();
  const title = useLabel('stats');
  const starsLabel = useLabel('stars');
  const s = d.stats;
  const elapsed = s.firstTs ? Math.max(0, s.lastTs - s.firstTs) : 0;
  const lastTests = [...d.runs].reverse().find((r) => r.tests)?.tests;
  const items = d.served.size > 0 ? d.served.size : d.turnsOk;
  const stars = Math.min(3, Math.floor(items / config.hud.itemsPerStar));
  const order = (d.sessionId ?? '0000').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase();

  return (
    <div className="h-full overflow-y-auto p-3">
      <div
        className="mx-auto max-w-[17rem] px-4 pb-6 pt-4 font-mono text-sm leading-relaxed"
        style={{
          background: 'color-mix(in srgb, var(--c-text) 94%, var(--c-bg))',
          color: 'var(--c-bg)',
          // torn, zig-zag bottom edge
          WebkitMask: 'conic-gradient(from -45deg at bottom, transparent, black 1deg 89deg, transparent 90deg) 50% / 12px 100%',
          mask: 'conic-gradient(from -45deg at bottom, transparent, black 1deg 89deg, transparent 90deg) 50% / 12px 100%',
          boxShadow: '0 6px 20px color-mix(in srgb, var(--c-shade) 40%, transparent)',
        }}
      >
        <div className="text-center">
          <div className="font-display text-lg font-semibold tracking-[0.2em]">{title.toUpperCase()}</div>
          <div className="text-xs opacity-70">ORDER #{order} · {new Date(s.firstTs ?? Date.now()).toLocaleDateString()}</div>
        </div>
        <div className="my-2 border-t border-dashed" style={{ borderColor: 'color-mix(in srgb, var(--c-bg) 50%, transparent)' }} />
        <Line label="Files changed" value={s.filesChanged.size} />
        <Line label="Commands run" value={s.commands} />
        <Line label="Errors hit" value={s.errors} />
        <Line label="Time elapsed" value={elapsed ? fmtDuration(elapsed) : '—'} />
        {lastTests && <Line label="Tests" value={`✓${lastTests.passed} ✕${lastTests.failed}`} />}
        <Line label="Tokens out" value={fmtTokens(d.usage.outputTokens)} />
        <div className="my-2 border-t border-dashed" style={{ borderColor: 'color-mix(in srgb, var(--c-bg) 50%, transparent)' }} />
        <Line label="SUBTOTAL" value={fmtCost(d.usage.costUsd)} />
        <Line label={`${starsLabel} tip`} value={'★'.repeat(stars) + '☆'.repeat(3 - stars)} />
        <div className="mt-3 text-center text-xs tracking-[0.25em] opacity-80">THANK YOU, PRODUCER</div>
      </div>
    </div>
  );
}
