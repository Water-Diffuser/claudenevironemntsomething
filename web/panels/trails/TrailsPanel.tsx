// ============================================================================
//  "Burn Marks": when something fails (a test, a build, a crash), the trail it
//  left through your code. Each error is a chain of clickable frames: click one
//  to jump to the line, and the files light up red on the map and graph.
// ============================================================================
import { Flame, FlaskConical, Terminal, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FrameChain } from '../../components/FrameChain';
import { timeAgo } from '../../lib/format';
import { useDerived } from '../../state/store';
import { useUI } from '../../state/ui';

const ICON = { test: FlaskConical, command: Terminal, tool: Wrench } as const;

export default function TrailsPanel() {
  const d = useDerived();
  const flash = useUI((s) => s.flash);
  const [picked, setPicked] = useState<string | null>(null);
  const errors = [...d.errors].reverse();
  const current = errors.find((e) => e.id === picked) ?? errors[0];

  // a new error arrives: show it
  useEffect(() => setPicked(null), [d.errors.length]);

  if (!current) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-dim">
        <div>
          <Flame className="mx-auto mb-2 text-accent" size={24} />
          <div className="mb-1 font-display text-lg text-accent-2">No burn marks</div>
          When a test, build or command fails, the trail through your code appears here.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="m-0 max-h-[38%] shrink-0 list-none overflow-y-auto border-b border-line p-1">
        {errors.map((e) => {
          const Icon = ICON[e.source];
          return (
            <li key={e.id}>
              <button
                onClick={() => (setPicked(e.id), flash([...new Set(e.frames.filter((f) => !f.external).map((f) => f.file))]))}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${e.id === current.id ? 'bg-bad/15' : 'hover:bg-surface-hi/60'}`}
              >
                <Icon size={13} className="shrink-0 text-bad" />
                <span className="min-w-0 truncate">{e.title}</span>
                <span className="ml-auto shrink-0 text-dim">{timeAgo(e.ts)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 whitespace-pre-wrap break-words rounded-md border border-bad/50 bg-bad/10 px-2 py-1.5 font-mono text-[0.76rem] text-bad">{current.message}</div>
        <div className="mb-1 text-[0.66rem] uppercase tracking-wider text-dim">The trail ({current.frames.length} frames)</div>
        <FrameChain frames={current.frames} />
      </div>
    </div>
  );
}
