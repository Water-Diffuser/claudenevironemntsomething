// ============================================================================
//  The Terminal: one running log of shell commands, in order.
//    * the commands YOU type at the prompt at the bottom
//    * the commands CLAUDE runs while it works (tests, builds, git...)
//  Output keeps its colors. Each command folds up to a single line to keep the
//  log tidy; the newest few stay open.
//
//  It is a command runner, not a full terminal: each command runs to the end,
//  and programs that wait for typed input just see an empty input.
// ============================================================================
import { Check, ChevronRight, Loader2, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseAnsi } from '../../lib/ansi';
import { fmtDuration } from '../../lib/format';
import { runCommand, stopCommand } from '../../lib/runCommand';
import { useApp, useDerived, useView } from '../../state/store';
import { useTerm } from '../../state/terminal';

interface Entry {
  id: string;
  who: 'you' | 'claude';
  command: string;
  startedAt: number;
  output: string;
  running: boolean;
  ok: boolean;
  ms?: number;
  note?: string;
}

/** How many of the newest commands are shown open. */
const OPEN_COUNT = 3;

function Output({ text }: { text: string }) {
  const spans = useMemo(() => parseAnsi(text), [text]);
  return (
    <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-bg px-3 py-2 font-mono text-xs leading-relaxed">
      {spans.map((s, i) => (
        <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
          {s.text}
        </span>
      ))}
      {text === '' && <span className="text-dim">(no output)</span>}
    </pre>
  );
}

export default function TerminalPanel() {
  const d = useDerived();
  const replaying = useView((s) => !!s.replay);
  const mine = useTerm((s) => s.runs);
  const history = useTerm((s) => s.history);
  const server = useApp((s) => s.server);
  const conn = useApp((s) => s.conn);
  const [draft, setDraft] = useState('');
  const [cursor, setCursor] = useState<number | null>(null); // position in the history while using the arrows
  const [toggled, setToggled] = useState<Record<string, boolean>>({}); // entries you opened or folded by hand
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const ready = conn === 'open' && !!server?.cwd && !replaying;
  const projectName = server?.cwd?.split('/').filter(Boolean).pop() ?? 'project';

  // Claude's commands (from the session log) and yours, in the order they started.
  const entries = useMemo<Entry[]>(() => {
    const claude: Entry[] = d.runs.map((r) => ({ id: r.id, who: 'claude', command: r.command, startedAt: r.startTs, output: r.output, running: r.running, ok: r.ok, ms: r.durationMs }));
    // (while looking at the past in Playback, only the session's own commands make sense)
    const you: Entry[] = replaying ? [] : mine.map((r) => ({ id: r.id, who: 'you', command: r.command, startedAt: r.startedAt, output: r.output, running: r.running, ok: r.code === 0, ms: r.ms, note: r.code && r.code !== 0 ? `exit ${r.code}` : r.signal ? `stopped (${r.signal})` : undefined }));
    return [...claude, ...you].sort((a, b) => a.startedAt - b.startedAt);
  }, [d.runs, d.count, mine, replaying]);

  // Keep the newest output in view, unless you scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stick.current = true;
  }, [replaying]);

  const runningMine = mine.find((r) => r.running);

  const submit = () => {
    const command = draft.trim();
    if (!command || !ready) return;
    setDraft('');
    setCursor(null);
    stick.current = true;
    if (command === 'clear') return useTerm.getState().clear();
    runCommand(command);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') return submit();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      const next = e.key === 'ArrowUp' ? (cursor === null ? history.length - 1 : Math.max(0, cursor - 1)) : cursor === null ? null : cursor + 1 >= history.length ? null : cursor + 1;
      setCursor(next);
      setDraft(next === null ? '' : history[next]);
    }
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      if (runningMine) stopCommand(runningMine.id);
      else setDraft('');
    }
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      useTerm.getState().clear();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {entries.length === 0 ? (
          <div className="empty">
            <h3 className="empty-title m-0 !text-lg">Nothing has run yet.</h3>
            <p className="m-0 max-w-[34ch] text-sm">Run a command below, or watch Claude's commands appear here as it works.</p>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-px p-0">
            {entries.map((e, i) => {
              const defaultOpen = e.running || i >= entries.length - OPEN_COUNT;
              const open = toggled[e.id] ?? defaultOpen;
              return (
                <li key={e.id} className="border-b border-line">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hi"
                    aria-expanded={open}
                    onClick={() => setToggled((t) => ({ ...t, [e.id]: !open }))}
                  >
                    <ChevronRight size={13} className={`shrink-0 text-dim transition-transform ${open ? 'rotate-90' : ''}`} />
                    <span className="font-mono text-xs text-accent">$</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{e.command}</span>
                    {e.who === 'claude' && <span className="chip">claude</span>}
                    {e.note && <span className="shrink-0 text-xs text-dim">{e.note}</span>}
                    {e.ms !== undefined && !e.running && <span className="shrink-0 text-xs text-dim">{fmtDuration(e.ms)}</span>}
                    {e.running ? <Loader2 size={13} className="shrink-0 animate-spin text-warn" aria-label="running" /> : e.ok ? <Check size={13} className="shrink-0 text-good" aria-label="succeeded" /> : <X size={13} className="shrink-0 text-bad" aria-label="failed" />}
                  </button>
                  {open && <Output text={e.output} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!replaying && (
        <form
          className="flex shrink-0 items-center gap-2 border-t border-line bg-bg-alt px-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <span className="font-mono text-xs text-accent" aria-hidden>
            {projectName} ❯
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs text-ink outline-none placeholder:text-dim"
            value={draft}
            disabled={!ready}
            placeholder={ready ? 'Run a command…  (↑ history, Ctrl+C stop, "clear")' : 'Pick a project first…'}
            onChange={(e) => (setDraft(e.target.value), setCursor(null))}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
            aria-label="Command to run in the project"
          />
          {runningMine && (
            <button type="button" className="btn btn-danger !h-6 !px-2" onClick={() => stopCommand(runningMine.id)} title="Stop the running command (Ctrl+C)" aria-label="Stop the running command">
              <Square size={11} fill="currentColor" />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
