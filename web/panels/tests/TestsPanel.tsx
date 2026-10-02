// ============================================================================
//  "Taste Test": every test is one small cell. Green = pass, red = fail,
//  yellow = running. Click a red cell to see its error and stack trace.
//  Other commands (builds, installs, linters) show as a progress strip with the
//  parsed result, with the raw output tucked away behind a click.
// ============================================================================
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, FlaskConical, Loader2, X } from 'lucide-react';
import type { TestCase } from '@shared/parse/tests';
import { FrameChain } from '../../components/FrameChain';
import { fmtDuration } from '../../lib/format';
import { useElementSize } from '../../lib/useElementSize';
import type { RunRecord } from '../../state/derived';
import { useDerived } from '../../state/store';
import { useUI } from '../../state/ui';

const CELL = 14;
const GAP = 4;
const PITCH = CELL + GAP;
const HEAD = 22;

function cellStyle(c: TestCase): string {
  switch (c.status) {
    case 'pass':
      return 'bg-good';
    case 'fail':
      return 'bg-bad';
    case 'running':
      return 'bg-k-run animate-pulse';
    default:
      return 'bg-dim/40';
  }
}

interface Group {
  file: string;
  cases: TestCase[];
}

function groupByFile(cases: TestCase[]): Group[] {
  const map = new Map<string, TestCase[]>();
  for (const c of cases) {
    const key = c.file ?? 'tests';
    (map.get(key) ?? map.set(key, []).get(key)!).push(c);
  }
  // failing files first, so problems are at the top
  return [...map].map(([file, list]) => ({ file, cases: list })).sort((a, b) => Number(b.cases.some((c) => c.status === 'fail')) - Number(a.cases.some((c) => c.status === 'fail')));
}

function TestGrid({ cases, selectedId, onSelect }: { cases: TestCase[]; selectedId: string | null; onSelect: (c: TestCase) => void }) {
  const { ref, el, width } = useElementSize<HTMLDivElement>();
  const groups = useMemo(() => groupByFile(cases), [cases]);
  const perRow = Math.max(1, Math.floor((width - 12 + GAP) / PITCH));
  const heights = groups.map((g) => HEAD + Math.ceil(g.cases.length / perRow) * PITCH + 8);
  const virt = useVirtualizer({ count: groups.length, getScrollElement: () => el, estimateSize: (i) => heights[i] ?? 60, overscan: 6 });
  useEffect(() => virt.measure(), [perRow, groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map((v) => {
          const g = groups[v.index];
          const failed = g.cases.filter((c) => c.status === 'fail').length;
          return (
            <div key={v.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` }}>
              <div className="flex items-center gap-2 text-xs" style={{ height: HEAD }}>
                <span className="min-w-0 truncate font-mono text-dim" title={g.file}>
                  {g.file}
                </span>
                <span className="ml-auto shrink-0 text-dim">{g.cases.length}</span>
                {failed > 0 && <span className="shrink-0 font-semibold text-bad">{failed} failed</span>}
              </div>
              <div className="flex flex-wrap" style={{ gap: GAP }}>
                {g.cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c)}
                    title={`${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : c.status === 'skip' ? '↷' : '…'} ${c.suite ? c.suite + ' › ' : ''}${c.name}${c.ms !== undefined ? ` (${Math.round(c.ms)}ms)` : ''}`}
                    aria-label={`${c.name}: ${c.status}`}
                    className={`rounded-[3px] transition-transform hover:scale-125 ${cellStyle(c)} ${selectedId === c.id ? 'ring-2 ring-accent-2 ring-offset-1 ring-offset-surface' : ''}`}
                    style={{ width: CELL, height: CELL }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A progress strip for a non-test command: status, parsed result chips, and (on click) details. */
function CommandStrip({ run }: { run: RunRecord }) {
  const [open, setOpen] = useState(false);
  const jump = useUI((s) => s.jump);
  const rep = run.report;
  const tone = { good: 'border-good/60 text-good', bad: 'border-bad/60 text-bad', warn: 'border-warn/60 text-warn', dim: 'border-line text-dim' } as const;
  const color = run.running ? 'bg-k-run' : run.ok ? 'bg-good' : 'bg-bad';
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface/60 text-xs">
      <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={13} className="shrink-0 text-dim" /> : <ChevronRight size={13} className="shrink-0 text-dim" />}
        {run.running ? <Loader2 size={14} className="shrink-0 animate-spin text-k-run" /> : run.ok ? <Check size={14} className="shrink-0 text-good" /> : <X size={14} className="shrink-0 text-bad" />}
        <span className="min-w-0 truncate font-mono">{run.command}</span>
        {rep && <span className="chip shrink-0 !py-0">{rep.title}</span>}
        <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
          {run.running ? <span className="text-k-run">running…</span> : rep?.chips.slice(0, 4).map((c, i) => (
            <span key={i} className={`rounded-full border px-1.5 ${tone[c.tone]}`}>
              {c.label}
            </span>
          ))}
        </span>
        {run.durationMs !== undefined && !run.running && <span className="shrink-0 text-dim">{fmtDuration(run.durationMs)}</span>}
      </button>
      {/* the progress strip itself */}
      <div className="h-[3px] w-full bg-line/40">
        <div className={`h-full ${color} ${run.running ? 'animate-pulse' : ''}`} style={{ width: run.running ? '60%' : `${Math.round((rep?.percent ?? 1) * 100)}%` }} />
      </div>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2">
          {rep && rep.highlights.length > 0 && (
            <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-xs">
              {rep.highlights.map((h, i) => (
                <li key={i} className={`truncate ${run.ok ? 'text-dim' : 'text-bad'}`} title={h}>
                  {h}
                </li>
              ))}
            </ul>
          )}
          {rep && rep.problems.length > 0 && (
            <ul className="m-0 max-h-32 list-none space-y-0.5 overflow-y-auto p-0 text-xs">
              {rep.problems.slice(0, 30).map((p, i) => (
                <li key={i}>
                  <button className="flex w-full gap-2 text-left hover:text-ink" onClick={() => jump(p.file, p.line)}>
                    <span className={p.severity === 'error' ? 'text-bad' : 'text-warn'}>{p.severity === 'error' ? '✕' : '!'}</span>
                    <span className="shrink-0 font-mono text-dim">
                      {p.file}:{p.line}
                    </span>
                    <span className="truncate">{p.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-dim">raw output</summary>
            <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-bg/60 p-2 font-mono text-xs">{run.output || '(no output)'}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default function TestsPanel() {
  const d = useDerived();
  const testRuns = d.runs.filter((r) => r.tests || r.expected);
  const [pickedRun, setPickedRun] = useState<string | null>(null);
  const [selected, setSelected] = useState<TestCase | null>(null);
  const run: RunRecord | undefined = (pickedRun ? testRuns.find((r) => r.id === pickedRun) : undefined) ?? testRuns[testRuns.length - 1];
  const cases: TestCase[] = run?.tests?.cases ?? run?.expected ?? [];
  const commandRuns = [...d.runs].filter((r) => !r.tests && !r.expected).reverse().slice(0, 12);

  // a new run starts: follow it
  useEffect(() => {
    setPickedRun(null);
    setSelected(null);
  }, [testRuns.length]);

  const counts = run?.tests;
  const running = !!run?.running;
  const selCase = selected ? cases.find((c) => c.id === selected.id) ?? selected : null;
  const total = cases.length || 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {run ? (
        <div className="shrink-0 border-b border-line px-2 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {testRuns.length > 1 ? (
              <select className="field !w-auto !py-0.5 text-xs" value={run.id} onChange={(e) => setPickedRun(e.target.value)} aria-label="Test run">
                {[...testRuns].reverse().map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {r.command.slice(0, 28)} · {i === 0 ? 'latest' : `#${testRuns.length - i}`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-dim">{run.command}</span>
            )}
            {running ? (
              <span className="inline-flex items-center gap-1 text-k-run">
                <Loader2 size={13} className="animate-spin" /> running…
              </span>
            ) : counts ? (
              <>
                <span className="font-semibold text-good">✓ {counts.passed}</span>
                <span className={`font-semibold ${counts.failed ? 'text-bad' : 'text-dim'}`}>✕ {counts.failed}</span>
                {counts.skipped > 0 && <span className="text-dim">↷ {counts.skipped}</span>}
                <span className="text-dim">
                  {counts.runner}
                  {counts.durationMs !== undefined ? ` · ${fmtDuration(counts.durationMs)}` : ''}
                </span>
              </>
            ) : null}
          </div>
          {counts && (
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line/40" aria-hidden>
              <div className="bg-good" style={{ width: `${(counts.passed / total) * 100}%` }} />
              <div className="bg-bad" style={{ width: `${(counts.failed / total) * 100}%` }} />
            </div>
          )}
        </div>
      ) : null}

      {cases.length > 0 ? (
        <TestGrid cases={cases} selectedId={selCase?.id ?? null} onSelect={setSelected} />
      ) : (
        <div className={`grid place-items-center p-6 text-center text-dim ${commandRuns.length ? 'py-4' : 'flex-1'}`}>
          <div>
            <FlaskConical className="mx-auto mb-2 text-accent" size={24} />
            <div className="mb-1 empty-title !text-lg">No test run yet</div>
            When Claude runs your tests, every test shows up here as a little cell.
          </div>
        </div>
      )}

      {selCase && (
        <div className="max-h-[42%] shrink-0 overflow-y-auto border-t border-line px-3 py-2 text-xs">
          <div className="mb-1 flex items-start gap-2">
            <span className={selCase.status === 'fail' ? 'text-bad' : selCase.status === 'pass' ? 'text-good' : 'text-dim'}>{selCase.status === 'fail' ? '✕' : selCase.status === 'pass' ? '✓' : '·'}</span>
            <div className="min-w-0">
              <div className="break-words font-semibold">{selCase.suite ? `${selCase.suite} › ${selCase.name}` : selCase.name}</div>
              {selCase.file && <div className="font-mono text-dim">{selCase.file}</div>}
            </div>
            {selCase.ms !== undefined && <span className="ml-auto shrink-0 text-dim">{Math.round(selCase.ms)}ms</span>}
          </div>
          {selCase.error && (
            <>
              <div className="my-1.5 whitespace-pre-wrap break-words rounded-md border border-bad/50 bg-bad/10 px-2 py-1 font-mono text-xs text-bad">{selCase.error.message}</div>
              <FrameChain frames={selCase.error.frames} />
            </>
          )}
        </div>
      )}

      {commandRuns.length > 0 && (
        <div className="max-h-[38%] shrink-0 space-y-1.5 overflow-y-auto border-t border-line px-2 py-2">
          <div className="text-xs uppercase tracking-wider text-dim">Commands</div>
          {commandRuns.map((r) => (
            <CommandStrip key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}
