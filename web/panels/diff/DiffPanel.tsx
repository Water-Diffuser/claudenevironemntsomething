// ============================================================================
//  "The Remix": the before/after of every edit Claude makes, as an animated
//  side-by-side diff. Removed lines get struck through and fade; added lines
//  fade in glowing green. Also shows +/- counts and which functions changed.
// ============================================================================
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { useScan } from '../../state/scan';
import { useDerived } from '../../state/store';
import { useUI } from '../../state/ui';
import { defineIndulgentTheme, languageFor, monaco } from '../../lib/monaco';
import { readThemeColors } from '../../lib/themeColors';
import { baseName, timeAgo } from '../../lib/format';
import { dur } from '../../theme/motion';
import { resolveTheme } from '../../theme/applyTheme';
import { useSettings } from '../../state/settings';
import { useThemeRev } from '../../theme/themeRev';
import type { EditRecord, Hunk } from '../../state/derived';

// ---- turn a hunk into aligned left/right rows ---------------------------------------
interface Side {
  n: number;
  text: string;
  kind: 'ctx' | 'del' | 'add';
}
interface Row {
  left?: Side;
  right?: Side;
}

function hunkRows(h: Hunk): Row[] {
  const rows: Row[] = [];
  let o = h.oldStart;
  let n = h.newStart;
  let dels: Side[] = [];
  let adds: Side[] = [];
  const flush = () => {
    const len = Math.max(dels.length, adds.length);
    for (let i = 0; i < len; i++) rows.push({ left: dels[i], right: adds[i] });
    dels = [];
    adds = [];
  };
  for (const line of h.lines) {
    const c = line[0];
    const text = line.slice(1);
    if (c === '-') dels.push({ n: o++, text, kind: 'del' });
    else if (c === '+') adds.push({ n: n++, text, kind: 'add' });
    else {
      flush();
      rows.push({ left: { n: o++, text, kind: 'ctx' }, right: { n: n++, text, kind: 'ctx' } });
    }
  }
  flush();
  return rows;
}

/** Syntax-color lines with Monaco. Returns one HTML string per line (or null while it is working). */
function useColorized(lines: string[], lang: string, key: string): string[] | null {
  const [html, setHtml] = useState<{ key: string; lines: string[] } | null>(null);
  const themeRev = useThemeRev((s) => s.rev);
  useEffect(() => {
    let cancelled = false;
    monaco.editor
      .colorize(lines.join('\n'), lang, { tabSize: 2 })
      .then((out) => !cancelled && setHtml({ key: key + themeRev, lines: out.split(/<br\s*\/?>/i) }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, lang, themeRev]); // eslint-disable-line react-hooks/exhaustive-deps
  return html?.key === key + themeRev ? html.lines : null;
}

function CodeLine({ side, html }: { side: Side; html?: string }) {
  return html !== undefined ? <span dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} /> : <span>{side.text || ' '}</span>;
}

/** One column cell. Animation is timed by `delay` (seconds). */
function Cell({ side, html, delay, replay }: { side?: Side; html?: string; delay: number; replay: number }) {
  if (!side) return <div className="bg-bg/30" aria-hidden />;
  const gutter = <span className="w-9 shrink-0 select-none pr-2 text-right text-dim opacity-70">{side.n || ''}</span>;
  const base = 'relative flex min-h-[1.3rem] whitespace-pre px-1 font-mono text-[0.76rem] leading-[1.3rem]';

  if (side.kind === 'ctx') {
    return (
      <motion.div key={replay} className={base} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: dur(0.25) }}>
        {gutter}
        <CodeLine side={side} html={html} />
      </motion.div>
    );
  }

  if (side.kind === 'del') {
    return (
      <div key={replay} className={base}>
        {/* red wash fades in, then the line is struck through and dims */}
        <motion.div className="absolute inset-0 bg-k-delete/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: dur(delay), duration: dur(0.25) }} />
        <motion.div className="relative flex" initial={{ opacity: 1 }} animate={{ opacity: 0.5 }} transition={{ delay: dur(delay + 0.5), duration: dur(0.5) }}>
          {gutter}
          <span className="relative">
            <CodeLine side={side} html={html} />
            <motion.i className="absolute left-0 top-1/2 block h-[2px] w-full bg-k-delete" style={{ originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: dur(delay + 0.25), duration: dur(0.3) }} />
          </span>
        </motion.div>
      </div>
    );
  }

  // added
  return (
    <div key={replay} className={base}>
      <motion.div className="absolute inset-0 bg-k-create/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: dur(delay), duration: dur(0.4) }} />
      <motion.div
        className="relative flex"
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: dur(delay), duration: dur(0.35), ease: 'easeOut' }}
        style={{ textShadow: 'none' }}
      >
        {gutter}
        <CodeLine side={side} html={html} />
      </motion.div>
    </div>
  );
}

function HunkView({ hunk, lang, editId, replay }: { hunk: Hunk; lang: string; editId: string; replay: number }) {
  const rows = useMemo(() => hunkRows(hunk), [hunk]);
  const leftLines = useMemo(() => rows.map((r) => r.left?.text ?? ''), [rows]);
  const rightLines = useMemo(() => rows.map((r) => r.right?.text ?? ''), [rows]);
  const leftHtml = useColorized(leftLines, lang, `${editId}-L-${hunk.newStart}`);
  const rightHtml = useColorized(rightLines, lang, `${editId}-R-${hunk.newStart}`);

  // Changed rows animate one after another, so the eye follows the change.
  let delayIndex = 0;
  return (
    <div className="grid grid-cols-2 gap-px bg-line/60">
      {rows.map((r, i) => {
        const changed = r.left?.kind === 'del' || r.right?.kind === 'add';
        const delay = changed ? 0.45 + delayIndex++ * 0.09 : 0;
        return (
          <div key={i} className="contents">
            <div className="min-w-0 overflow-hidden bg-surface">
              <Cell side={r.left} html={leftHtml?.[i]} delay={delay} replay={replay} />
            </div>
            <div className="min-w-0 overflow-hidden bg-surface">
              <Cell side={r.right} html={rightHtml?.[i]} delay={delay + 0.35} replay={replay} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DiffPanel() {
  const d = useDerived();
  const files = useScan((s) => s.files);
  const analysisVersion = useScan((s) => s.analysisVersion);
  const selectFile = useUI((s) => s.selectFile);
  const themeRev = useThemeRev((s) => s.rev);
  const themeSettings = useSettings((s) => s.ui.theme);
  const [pinned, setPinned] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  // Make sure Monaco's color theme exists before we ask it to color code.
  useEffect(() => {
    defineIndulgentTheme(readThemeColors(), resolveTheme(themeSettings).dark);
    monaco.editor.setTheme('indulgent');
  }, [themeRev, themeSettings]);

  const edits = d.edits;
  const edit: EditRecord | undefined = (pinned ? edits.find((e) => e.id === pinned) : undefined) ?? edits[edits.length - 1];
  // A new edit arrives -> follow it (unless you pinned an older one).
  useEffect(() => setPinned(null), [edits.length]);

  // Which functions did this edit touch? (symbols whose line range overlaps a changed range)
  const functions = useMemo(() => {
    if (!edit) return [];
    const info = files.get(edit.path);
    const names = new Set<string>();
    for (const s of info?.symbols ?? []) {
      if (s.kind === 'class' || s.kind === 'type') continue;
      if (edit.newRanges.some(([a, b]) => a <= s.endLine && b >= s.startLine)) names.add(s.parent ? `${s.parent}.${s.name}` : s.name);
    }
    return [...names].slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, analysisVersion]);

  if (!edit) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-dim">
        <div>
          <div className="mb-1 font-display text-lg text-accent-2">No edits yet</div>
          When Claude changes a file, the before and after appear here, line by line.
        </div>
      </div>
    );
  }

  const lang = languageFor(edit.path);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1.5 text-xs">
        <button className="min-w-0 truncate font-mono text-accent-2 hover:underline" title={edit.path} onClick={() => selectFile(edit.path)}>
          {edit.path}
        </button>
        <span className="rounded border border-k-create/60 px-1.5 font-semibold text-k-create">+{edit.added}</span>
        <span className="rounded border border-k-delete/60 px-1.5 font-semibold text-k-delete">−{edit.removed}</span>
        {edit.type === 'create' && <span className="chip !py-0 text-k-create">new file</span>}
        <button className="btn btn-ghost ml-auto !px-1.5 !py-0.5 text-xs" onClick={() => setReplay((n) => n + 1)} title="Play the animation again">
          <Play size={12} /> replay
        </button>
      </div>

      {functions.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1 text-[0.7rem]">
          <span className="text-dim">changed:</span>
          {functions.map((f) => (
            <span key={f} className="rounded-full border border-k-edit/50 px-2 font-mono text-k-edit">
              {f}()
            </span>
          ))}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-px bg-line/60 text-[0.62rem] uppercase tracking-widest text-dim">
        <div className="bg-bg-alt px-2 py-0.5">before</div>
        <div className="bg-bg-alt px-2 py-0.5">after</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {edit.hunks.map((h, i) => (
          <div key={`${edit.id}-${i}`}>
            {i > 0 && <div className="bg-bg-alt py-0.5 text-center text-xs text-dim">⋯</div>}
            <HunkView hunk={h} lang={lang} editId={edit.id} replay={replay} />
          </div>
        ))}
      </div>

      {edits.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line px-2 py-1" aria-label="Edit history">
          {edits.slice(-14).map((e) => (
            <button
              key={e.id}
              onClick={() => setPinned(e.id)}
              className={`chip shrink-0 hover:border-accent ${e.id === edit.id ? 'border-accent text-ink' : ''}`}
              title={`${e.path} · ${timeAgo(e.ts)}`}
            >
              {baseName(e.path)} <span className="text-k-create">+{e.added}</span> <span className="text-k-delete">−{e.removed}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
