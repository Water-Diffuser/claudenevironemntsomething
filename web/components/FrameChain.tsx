// A stack trace drawn as a chain of clickable frames: where it failed at the top,
// then each function that called it. Click a frame to jump to that line in the code
// view and flash the file on the map and graph. Library frames are folded away.
import { useState } from 'react';
import { ChevronDown, ChevronRight, Flame } from 'lucide-react';
import type { StackFrame } from '@shared/parse/stack';
import { useScan } from '../state/scan';
import { useUI } from '../state/ui';

export function FrameChain({ frames }: { frames: StackFrame[] }) {
  const [showLibs, setShowLibs] = useState(false);
  const files = useScan((s) => s.files);
  const jump = useUI((s) => s.jump);
  const flash = useUI((s) => s.flash);

  const mine = frames.filter((f) => !f.external);
  const libs = frames.length - mine.length;
  const shown = showLibs ? frames : mine;
  if (frames.length === 0) return <div className="text-xs text-dim">No stack frames found in the output.</div>;

  const open = (f: StackFrame) => {
    if (!f.external && files.has(f.file)) jump(f.file, f.line);
    flash([...new Set(frames.filter((x) => !x.external).map((x) => x.file))]);
  };

  return (
    <ol className="m-0 list-none p-0" aria-label="Stack trace">
      {shown.map((f, i) => {
        const exists = !f.external && files.has(f.file);
        return (
          <li key={i} className="relative pl-6">
            {/* the line connecting the frames */}
            {i < shown.length - 1 && <span className="absolute left-[0.62rem] top-5 h-[calc(100%-0.25rem)] w-px bg-line" aria-hidden />}
            <span className={`absolute left-1 top-[0.55rem] grid size-[0.9rem] place-items-center rounded-full border ${i === 0 ? 'border-bad bg-bad/20 text-bad' : 'border-line bg-surface text-dim'}`} aria-hidden>
              {i === 0 ? <Flame size={9} /> : <span className="text-[0.55rem]">{i}</span>}
            </span>
            <button
              onClick={() => open(f)}
              disabled={!exists && f.external}
              className={`mb-1 block w-full rounded-md border px-2 py-1 text-left transition ${f.external ? 'border-transparent opacity-50' : i === 0 ? 'border-bad/60 bg-bad/10 hover:border-bad' : 'border-line bg-surface/60 hover:border-accent'}`}
              title={f.raw}
            >
              {f.fn && <div className="truncate font-mono text-[0.78rem] font-semibold">{f.fn}()</div>}
              <div className="truncate font-mono text-[0.7rem] text-dim">
                {f.file}:{f.line}
                {f.col ? `:${f.col}` : ''}
              </div>
            </button>
          </li>
        );
      })}
      {libs > 0 && (
        <li className="pl-6">
          <button className="flex items-center gap-1 text-xs text-dim hover:text-ink" onClick={() => setShowLibs((v) => !v)}>
            {showLibs ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {libs} library frame{libs === 1 ? '' : 's'}
          </button>
        </li>
      )}
    </ol>
  );
}
