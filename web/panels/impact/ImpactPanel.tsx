// ============================================================================
//  "Ripples": what might break? Everything that imports the file Claude changed,
//  and everything that calls the functions it changed, ring by ring.
//  The list is virtualized (only visible rows are drawn), so even a huge ripple is fast.
// ============================================================================
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { Pin, PinOff, Radar } from 'lucide-react';
import { useImpact, useCodeGraph } from '../../lib/useImpact';
import { useUI } from '../../state/ui';

type Row =
  | { t: 'head'; text: string }
  | { t: 'file'; path: string; depth: number }
  | { t: 'sym'; id: string; qname: string; path: string; depth: number };

export default function ImpactPanel() {
  const { impact, label, auto } = useImpact();
  const graph = useCodeGraph();
  const selectFile = useUI((s) => s.selectFile);
  const selectSymbol = useUI((s) => s.selectSymbol);
  const setImpactTarget = useUI((s) => s.setImpactTarget);
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (!impact) return [];
    const out: Row[] = [];
    const files = [...impact.fileDepth].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (files.length) out.push({ t: 'head', text: `Files that import it (${files.length})` });
    for (const [path, depth] of files) out.push({ t: 'file', path, depth });
    const syms = [...impact.symDepth].sort((a, b) => a[1] - b[1]);
    if (syms.length) out.push({ t: 'head', text: `Functions that call it (${syms.length})` });
    for (const [id, depth] of syms) {
      const s = graph.symbols.get(id);
      if (s) out.push({ t: 'sym', id, qname: s.qname, path: s.path, depth });
    }
    return out;
  }, [impact, graph]);

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 26, overscan: 12 });

  if (!impact) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-dim">
        <div>
          <Radar className="mx-auto mb-2 text-accent" size={26} />
          <div className="mb-1 font-display text-lg text-accent-2">No ripples yet</div>
          After Claude edits a file, everything that depends on it shows up here. Or click a node in the graph and press <b>What breaks?</b>
        </div>
      </div>
    );
  }

  const depthCounts = [1, 2, 3, 4].map((d) => [...impact.fileDepth.values(), ...impact.symDepth.values()].filter((x) => x === d).length);
  const max = Math.max(1, ...depthCounts);
  const total = impact.fileDepth.size + impact.symDepth.size;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-dim">If</span>
          <span className="min-w-0 truncate font-mono font-semibold text-accent-2" title={label}>
            {label}
          </span>
          <span className="text-dim">changes…</span>
          <button className="btn btn-ghost ml-auto !px-1.5 !py-0.5 text-xs" onClick={() => setImpactTarget(auto ? { path: impact.source.path, symbolIds: impact.source.symbols } : null)} title={auto ? 'Pin this so it stays when Claude edits something else' : "Follow Claude's latest edit again"}>
            {auto ? <Pin size={12} /> : <PinOff size={12} />} {auto ? 'following Claude' : 'pinned'}
          </button>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div>
            <div className="font-display text-3xl leading-none text-accent-2 glow-text">{total}</div>
            <div className="text-[0.66rem] uppercase tracking-wider text-dim">might be affected</div>
          </div>
          <div className="flex h-10 flex-1 items-end gap-1.5" aria-label="Ripples by distance">
            {depthCounts.map((c, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                <div className="w-full rounded-sm bg-accent-2" style={{ height: `${Math.max(c ? 8 : 2, (c / max) * 30)}px`, opacity: 1 - i * 0.2 }} title={`${c} ${i === 0 ? 'directly' : `${i + 1} steps away`}`} />
                <span className="text-[0.58rem] text-dim">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        {impact.capped && <div className="mt-1 text-[0.68rem] text-warn">This ripple is huge, so the list was cut short.</div>}
      </div>

      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-dim">Nothing else imports or calls this. A change here stays contained.</div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((v) => {
              const r = rows[v.index];
              const pos = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` };
              if (r.t === 'head') {
                return (
                  <div key={v.key} style={pos} className="flex items-center bg-bg-alt/60 px-3 text-[0.66rem] uppercase tracking-wider text-dim">
                    {r.text}
                  </div>
                );
              }
              const depth = r.depth;
              return (
                <button
                  key={v.key}
                  style={pos}
                  className="flex items-center gap-2 px-3 text-left text-xs hover:bg-accent/10"
                  onClick={() => (r.t === 'file' ? selectFile(r.path) : selectSymbol(graph.symbols.get(r.id) ?? null))}
                >
                  <span className="inline-block size-2 shrink-0 rounded-full bg-accent-2" style={{ opacity: 1 - (depth - 1) * 0.22 }} title={`${depth} step${depth === 1 ? '' : 's'} away`} />
                  <span className="min-w-0 truncate font-mono">{r.t === 'file' ? r.path : `${r.qname}()`}</span>
                  {r.t === 'sym' && <span className="ml-auto shrink-0 truncate text-dim">{r.path.split('/').pop()}</span>}
                  {r.t === 'file' && <span className="ml-auto shrink-0 text-dim">{depth === 1 ? 'direct' : `${depth} away`}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
