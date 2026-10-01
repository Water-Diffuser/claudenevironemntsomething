// ============================================================================
//  "Pitch Curve": token usage over time as a smooth line (Recharts), like the
//  pitch line in a vocal-synth editor. The big area is the context window filling
//  up; the thin line is the total tokens Claude has written.
// ============================================================================
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDuration, fmtTokens } from '../../lib/format';
import { useDerived } from '../../state/store';

export default function PitchPanel() {
  const d = useDerived();
  const t0 = d.stats.firstTs ?? 0;
  const points = d.series.map((p) => ({ t: (p.ts - t0) / 1000, context: p.context, output: p.output }));

  if (points.length < 2) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-dim">
        <div>
          <div className="mb-1 font-display text-lg text-accent-2">Waiting for the first note</div>
          Token usage is drawn here as Claude works.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pitch-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--c-accent)', stopOpacity: 0.65 }} />
              <stop offset="100%" style={{ stopColor: 'var(--c-accent)', stopOpacity: 0.02 }} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--c-border)" strokeOpacity={0.35} vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtDuration(v * 1000)} stroke="var(--c-text-dim)" tick={{ fontSize: 10 }} tickLine={false} />
          <YAxis stroke="var(--c-text-dim)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={38} tickFormatter={(v: number) => fmtTokens(v)} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { t: number; context: number; output: number };
              return (
                <div className="rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-lg">
                  <div className="text-dim">{fmtDuration(p.t * 1000)} in</div>
                  <div>context: <b>{fmtTokens(p.context)}</b></div>
                  <div>written: <b>{fmtTokens(p.output)}</b></div>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="context" stroke="var(--c-accent)" strokeWidth={2.2} fill="url(#pitch-fill)" isAnimationActive={false} dot={false} />
          <Line type="monotone" dataKey="output" stroke="var(--c-accent-2)" strokeWidth={1.6} strokeDasharray="4 3" isAnimationActive={false} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
