// ============================================================================
//  "Recipe Book": your git history.
//   * working-tree changes as little colored blocks (pink = edited, green = new, red = deleted)
//   * a branch/commit graph; every commit Claude makes appears as a new glowing node
// ============================================================================
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react';
import type { GitChange, GitCommit } from '@shared/git';
import { baseName, timeAgo } from '../../lib/format';
import { useGit } from '../../state/git';
import { useUI } from '../../state/ui';
import { dur } from '../../theme/motion';
import { layoutLanes } from './lanes';

const ROW = 30;
const LANE_W = 14;
const LANE_COLORS = ['var(--c-accent)', 'var(--k-read)', 'var(--k-create)', 'var(--k-search)', 'var(--k-run)', 'var(--c-accent-2)', 'var(--k-edit)'];
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

const KIND_COLOR: Record<GitChange['kind'], string> = {
  modified: 'var(--k-edit)',
  added: 'var(--k-create)',
  untracked: 'var(--k-create)',
  deleted: 'var(--k-delete)',
  renamed: 'var(--k-search)',
  conflict: 'var(--c-warn)',
};

/** One small block per changed file; wider = more lines changed. */
function ChangeBlocks({ changes }: { changes: GitChange[] }) {
  const selectFile = useUI((s) => s.selectFile);
  if (changes.length === 0) return <div className="px-3 py-2 text-xs text-dim">Working tree clean: nothing changed since the last commit.</div>;
  return (
    <div className="flex flex-wrap gap-[3px] px-3 py-2" aria-label="Changed files">
      {changes.slice(0, 300).map((c) => {
        const lines = (c.add ?? 0) + (c.del ?? 0);
        const w = Math.round(Math.min(56, 12 + Math.log2(lines + 1) * 7));
        return (
          <button
            key={c.path}
            onClick={() => selectFile(c.path)}
            title={`${c.kind}${c.staged ? ' (staged)' : ''}: ${c.path}${lines ? `  +${c.add ?? 0} −${c.del ?? 0}` : ''}`}
            className="h-4 rounded-[3px] transition-transform hover:scale-110"
            style={{ width: w, background: KIND_COLOR[c.kind], opacity: c.staged ? 1 : 0.62, outline: c.staged ? '1px solid var(--c-text)' : 'none', outlineOffset: -1 }}
          />
        );
      })}
      {changes.length > 300 && <span className="self-center text-xs text-dim">+{changes.length - 300} more</span>}
    </div>
  );
}

function Refs({ refs }: { refs: string[] }) {
  return (
    <>
      {refs.slice(0, 3).map((r) => {
        const isHead = r.startsWith('HEAD -> ');
        const name = r.replace(/^HEAD -> /, '').replace(/^tag: /, 'tag · ');
        return (
          <span key={r} className={`shrink-0 rounded-full border px-1.5 text-xs ${isHead ? 'border-accent text-accent' : 'border-line text-dim'}`}>
            {name}
          </span>
        );
      })}
    </>
  );
}

export default function GitPanel() {
  const git = useGit((s) => s.state);
  const claudeShas = useGit((s) => s.claudeShas);
  const scroller = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutLanes(git?.commits ?? []), [git?.commits]);
  const virt = useVirtualizer({ count: git?.commits.length ?? 0, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 10 });

  if (!git) return <div className="grid h-full place-items-center p-6 text-center text-dim">Choose a project to see its history.</div>;
  if (!git.isRepo) return <div className="grid h-full place-items-center p-6 text-center text-dim">This folder is not a git repository, so there is no recipe book yet. (Run <code className="font-mono">git init</code> to start one.)</div>;

  const width = layout.laneCount * LANE_W + 16;
  const counts = git.changes.reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {});

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 text-xs">
        <span className="inline-flex items-center gap-1 font-mono text-ink">
          <GitBranch size={13} /> {git.branch ?? '(detached)'}
        </span>
        {git.ahead > 0 && (
          <span className="inline-flex items-center text-good" title="commits not pushed yet">
            <ArrowUp size={12} />
            {git.ahead}
          </span>
        )}
        {git.behind > 0 && (
          <span className="inline-flex items-center text-warn" title="commits to pull">
            <ArrowDown size={12} />
            {git.behind}
          </span>
        )}
        <span className="ml-auto text-dim">
          {git.changes.length === 0 ? 'clean' : Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ')}
        </span>
      </div>
      <div className="shrink-0 border-b border-line">
        <div className="px-3 pt-1.5 text-xs uppercase tracking-wider text-dim">Working tree</div>
        <ChangeBlocks changes={git.changes} />
      </div>

      {git.commits.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-dim">No commits yet.</div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((v) => {
              const c = git.commits[v.index];
              return (
                <div key={v.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW, transform: `translateY(${v.start}px)` }} className="flex items-center hover:bg-accent/5">
                  <Lane commit={c} row={layout.rows[v.index]} width={width} isHead={c.sha === git.head} mine={claudeShas.has(c.sha) || !!c.virtual} />
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-3 text-xs">
                    <span className="min-w-0 truncate" title={c.message}>
                      {c.message}
                    </span>
                    <Refs refs={c.refs} />
                    {(claudeShas.has(c.sha) || c.virtual) && <span className="chip shrink-0 border-accent text-accent">claude</span>}
                    <span className="ml-auto shrink-0 text-xs text-dim">
                      {c.virtual ? 'rehearsal' : baseName(c.author.split(' ')[0])} · {timeAgo(c.ts * 1000)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** The little SVG for one row of the graph: the vertical tracks, the curves, and the commit's dot. */
function Lane({ commit, row, width, isHead, mine }: { commit: GitCommit; row: ReturnType<typeof layoutLanes>['rows'][number]; width: number; isHead: boolean; mine: boolean }) {
  const x = (lane: number) => lane * LANE_W + 12;
  const mid = ROW / 2;
  const lines: React.ReactNode[] = [];
  const curve = (x1: number, y1: number, x2: number, y2: number, color: string, key: string) => (
    <path key={key} d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`} stroke={color} strokeWidth={1.8} fill="none" />
  );
  const n = Math.max(row.before.length, row.after.length);
  for (let j = 0; j < n; j++) {
    if (j === row.lane) continue;
    // a lane that just passes through this row
    if (row.before[j] && row.after[j] && row.before[j] === row.after[j]) lines.push(<line key={`p${j}`} x1={x(j)} y1={0} x2={x(j)} y2={ROW} stroke={laneColor(j)} strokeWidth={1.8} />);
  }
  if (row.before[row.lane]) lines.push(<line key="in" x1={x(row.lane)} y1={0} x2={x(row.lane)} y2={mid} stroke={laneColor(row.lane)} strokeWidth={1.8} />);
  if (row.after[row.lane]) lines.push(<line key="out" x1={x(row.lane)} y1={mid} x2={x(row.lane)} y2={ROW} stroke={laneColor(row.lane)} strokeWidth={1.8} />);
  for (const j of row.mergeFrom) lines.push(curve(x(j), 0, x(row.lane), mid, laneColor(j), `m${j}`));
  for (const k of row.branchTo) lines.push(curve(x(row.lane), mid, x(k), ROW, laneColor(k), `b${k}`));

  const color = laneColor(row.lane);
  return (
    <svg width={width} height={ROW} className="shrink-0 overflow-visible" aria-hidden>
      {lines}
      {mine ? (
        // Claude's commits pop in with a glow
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 14, duration: dur(0.5) }} style={{ transformOrigin: `${x(row.lane)}px ${mid}px`, filter: 'drop-shadow(0 0 6px var(--c-accent))' }}>
          <circle cx={x(row.lane)} cy={mid} r={7} fill="none" stroke="var(--c-accent)" strokeWidth={2} strokeDasharray={commit.virtual ? '3 2' : undefined} />
          <circle cx={x(row.lane)} cy={mid} r={4} fill="var(--c-accent)" />
        </motion.g>
      ) : (
        <>
          {isHead && <circle cx={x(row.lane)} cy={mid} r={7} fill="none" stroke={color} strokeWidth={1.5} />}
          <circle cx={x(row.lane)} cy={mid} r={4.2} fill="var(--c-surface)" stroke={color} strokeWidth={2} />
        </>
      )}
    </svg>
  );
}
