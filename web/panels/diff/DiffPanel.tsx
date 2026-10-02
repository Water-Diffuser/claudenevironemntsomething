// ============================================================================
//  "The Remix": the before/after of every edit Claude makes, as an animated
//  side-by-side diff. Removed lines get struck through and fade; added lines
//  fade in glowing green. Also shows +/- counts and which functions changed.
// ============================================================================
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Check, Play, Undo2 } from 'lucide-react';
import { useScan } from '../../state/scan';
import { useApp, useDerived, useView } from '../../state/store';
import { useReview } from '../../state/review';
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
  const base = 'relative flex min-h-[1.3rem] whitespace-pre px-1 font-mono text-xs leading-[1.3rem]';

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
  const server = useApp((s) => s.server);
  const files = useScan((s) => s.files);
  const analysisVersion = useScan((s) => s.analysisVersion);
  const selectFile = useUI((s) => s.selectFile);
  const themeRev = useThemeRev((s) => s.rev);
  const themeSettings = useSettings((s) => s.ui.theme);
  const [pinned, setPinned] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const decisions = useReview((s) => s.decisions);
  const replaying = useView((s) => !!s.replay);
  const [sure, setSure] = useState(false); // "Revert" was clicked once: waiting for the second click
  const [busy, setBusy] = useState(false);

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

  // The "are you sure?" state ends by itself after a few seconds, or when you look at another edit.
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3500);
    return () => clearTimeout(t);
  }, [sure]);
  useEffect(() => setSure(false), [edit?.id]);

  if (!edit) {
    return (
      <div className="empty">
        <h3 className="empty-title m-0 !text-lg">No edits yet.</h3>
        <p className="m-0 max-w-[34ch] text-sm">When Claude changes a file, the before and after appear here, and you can keep or revert each change.</p>
      </div>
    );
  }

  const decision = decisions[edit.id];
  const keep = () => useReview.getState().decide(edit.id, 'kept');
  // Revert asks the server to put the file back. It only does so if the file still looks exactly as the edit left it.
  const revert = async () => {
    if (!sure) return setSure(true);
    setSure(false);
    setBusy(true);
    try {
      const res = await fetch('/api/revert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: edit.path, type: edit.type, hunks: edit.hunks }) });
      const out = (await res.json()) as { ok?: boolean; action?: string; error?: string };
      if (res.ok && out.ok) {
        useReview.getState().decide(edit.id, 'reverted');
        useApp.getState().toast(out.action === 'deleted' ? `Removed ${edit.path}` : `Put ${edit.path} back the way it was`);
      } else {
        useApp.getState().toast(server?.mode === 'rehearsal' ? 'This was a rehearsal edit, so nothing really changed on disk and there is nothing to undo.' : (out.error ?? 'Could not undo this edit.'), 'error');
      }
    } catch (err) {
      useApp.getState().toast(String((err as Error).message ?? err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const lang = languageFor(edit.path);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-xs">
        <button className="min-w-0 truncate font-mono text-ink hover:underline" title={`Open ${edit.path}`} onClick={() => selectFile(edit.path)}>
          {edit.path}
        </button>
        <span className="text-k-create">+{edit.added}</span>
        <span className="text-k-delete">−{edit.removed}</span>
        {edit.type === 'create' && <span className="chip">new file</span>}
        <div className="ml-auto flex items-center gap-1">
          {decision ? (
            <span className={`chip ${decision === 'kept' ? 'text-good' : 'text-warn'}`}>{decision === 'kept' ? 'kept' : 'reverted'}</span>
          ) : (
            !replaying && (
              <>
                <button className={`btn !h-6 !px-2 text-xs ${sure ? 'border-bad text-bad' : ''}`} disabled={busy} onClick={() => void revert()} title={edit.type === 'create' ? 'Delete the file Claude created' : 'Put the file back the way it was before this edit'}>
                  <Undo2 size={12} /> {sure ? 'Sure?' : 'Revert'}
                </button>
                <button className="btn btn-primary !h-6 !px-2 text-xs" onClick={keep} title="You looked at this change and it stays">
                  <Check size={12} /> Keep
                </button>
              </>
            )
          )}
          <button className="icon-btn icon-btn-sm" onClick={() => setReplay((n) => n + 1)} title="Play the animation again" aria-label="Replay the animation">
            <Play size={12} />
          </button>
        </div>
      </div>

      {functions.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5 text-xs">
          <span className="text-dim">in</span>
          {functions.map((f) => (
            <span key={f} className="chip font-mono text-ink">
              {f}()
            </span>
          ))}
        </div>
      )}

      <div className="eyebrow grid shrink-0 grid-cols-2 gap-px bg-line/60">
        <div className="bg-bg-alt px-3 py-1">before</div>
        <div className="bg-bg-alt px-3 py-1">after</div>
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
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line px-3 py-1.5" aria-label="Edit history">
          {edits.slice(-14).map((e) => (
            <button
              key={e.id}
              onClick={() => setPinned(e.id)}
              className={`chip shrink-0 transition-colors hover:text-ink ${e.id === edit.id ? 'border-accent text-ink' : ''}`}
              title={`${e.path} · ${timeAgo(e.ts)}${decisions[e.id] ? ' · ' + decisions[e.id] : ''}`}
            >
              {!decisions[e.id] && <span className="size-1.5 rounded-full bg-accent" aria-label="not reviewed yet" />}
              {decisions[e.id] === 'kept' && <Check size={10} className="text-good" aria-label="kept" />}
              {decisions[e.id] === 'reverted' && <Undo2 size={10} className="text-warn" aria-label="reverted" />}
              {baseName(e.path)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
