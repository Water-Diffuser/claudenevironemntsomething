// ============================================================================
//  "The Pie": which kinds of tool calls Claude used, as a sliced pie (Recharts).
//  Slice colors are the color code. Hover a slice to see the exact tools.
// ============================================================================
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useKindLabels } from '../../state/settings';
import { KINDS, type Kind } from '@shared/events';
import { kindVar } from '../../components/KindIcon';
import { useDerived } from '../../state/store';

export default function DonutPanel() {
  const kindLabels = useKindLabels();
  const d = useDerived();
  const data = KINDS.map((k: Kind) => ({ kind: k, name: kindLabels[k], value: d.stats.kindCounts[k] ?? 0 })).filter((x) => x.value > 0);
  const total = data.reduce((a, x) => a + x.value, 0);

  // top tools overall (for the little list)
  const tools = Object.entries(d.stats.toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (total === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-dim">
        <div>
          <div className="mb-1 font-display text-lg text-accent-2">Nothing baked yet</div>
          As Claude works, its tool calls are sliced up here by kind.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center gap-3 p-2">
      <div className="relative h-full min-h-[8rem] min-w-[8rem] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* the crust */}
            <Pie data={[{ v: 1 }]} dataKey="v" innerRadius="86%" outerRadius="94%" isAnimationActive={false} stroke="none" fill="color-mix(in srgb, var(--c-warn) 35%, var(--c-bg))" />
            {/* the slices */}
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="38%" outerRadius="84%" paddingAngle={4} cornerRadius={5} startAngle={90} endAngle={-270} stroke="var(--c-bg)" strokeWidth={2} animationDuration={500}>
              {data.map((x) => (
                <Cell key={x.kind} fill={kindVar(x.kind)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { name: string; value: number };
                return (
                  <div className="rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-lg">
                    <b>{p.name}</b>: {p.value} call{p.value === 1 ? '' : 's'}
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-2xl leading-none text-accent-2 glow-text">{total}</div>
            <div className="text-[0.62rem] uppercase tracking-wider text-dim">tool calls</div>
          </div>
        </div>
      </div>
      <ul className="m-0 w-36 shrink-0 list-none space-y-1 p-0 text-xs">
        {data.map((x) => (
          <li key={x.kind} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: kindVar(x.kind) }} />
            <span style={{ color: kindVar(x.kind) }} className="font-semibold">
              {x.name}
            </span>
            <span className="ml-auto text-dim">{x.value}</span>
          </li>
        ))}
        <li className="my-1 border-t border-line" />
        {tools.map(([name, n]) => (
          <li key={name} className="flex items-center gap-1.5 text-dim">
            <span className="truncate">{name}</span>
            <span className="ml-auto">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
