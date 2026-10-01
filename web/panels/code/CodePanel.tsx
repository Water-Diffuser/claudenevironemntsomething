// ============================================================================
//  "The Pass": the file Claude is currently in, shown in a real code editor
//  (Monaco, the editor from VS Code) with a minimap on the right.
//
//    * a glowing "cursor" line shows where Claude is working
//    * lines Claude READ are tinted blue, EDITED pink, CREATED green, SEARCHED purple
//    * the minimap shows the same colored markers for the whole file at a glance
//    * click a file on the map to pin it; "follow Claude" returns to automatic mode
// ============================================================================
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Pin } from 'lucide-react';
import { config } from '@config';
import type { Kind } from '@shared/events';
import { kindVar } from '../../components/KindIcon';
import { defineIndulgentTheme, languageFor, monaco } from '../../lib/monaco';
import { readThemeColors } from '../../lib/themeColors';
import { useFileContent } from '../../lib/useFileContent';
import { useSettings } from '../../state/settings';
import { getView, useDerived } from '../../state/store';
import { useUI } from '../../state/ui';
import { resolveTheme } from '../../theme/applyTheme';
import { useThemeRev } from '../../theme/themeRev';

type CodeEditor = Parameters<OnMount>[0];

/** How "fresh" a region is: l1 = just now, l2 = recent, l3 = older. */
function freshness(now: number, ts: number, active: boolean): string {
  if (active) return 'l1 live';
  const age = now - ts;
  return age < 15_000 ? 'l1' : age < 90_000 ? 'l2' : 'l3';
}

export default function CodePanel() {
  const d = useDerived();
  const selected = useUI((s) => s.selectedFile);
  const jumpTo = useUI((s) => s.jumpTo);
  const themeRev = useThemeRev((s) => s.rev);
  const themeSettings = useSettings((s) => s.ui.theme);
  const dark = useMemo(() => resolveTheme(themeSettings).dark, [themeSettings]);
  const [follow, setFollow] = useState(true);
  const [tick, setTick] = useState(0);
  const editorRef = useRef<CodeEditor | null>(null);
  const decoRef = useRef<ReturnType<CodeEditor['createDecorationsCollection']> | null>(null);
  const lastReveal = useRef({ line: 0, at: 0 });

  // Picking a file on the map pins it; "follow Claude" goes back to the automatic mode.
  useEffect(() => {
    if (selected) setFollow(false);
  }, [selected]);
  // Jumping to a line (from a stack frame) pins the file; the red highlight clears itself after a few seconds.
  useEffect(() => {
    if (!jumpTo) return;
    setFollow(false);
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const stop = setTimeout(() => clearInterval(t), 6500);
    return () => (clearInterval(t), clearTimeout(stop));
  }, [jumpTo]);

  const cursorPath = d.cursor?.path ?? null;
  const path = follow ? cursorPath ?? selected : selected ?? cursorPath;

  // Text of the file (or, if Claude just created it and it isn't on disk yet, what Claude wrote).
  const { content, status, truncated } = useFileContent(path);
  const createdText = useMemo(() => {
    if (!path || status === 'ok') return null;
    const edit = [...d.edits].reverse().find((e) => e.path === path && e.type === 'create');
    return edit ? edit.hunks.flatMap((h) => h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1))).join('\n') : null;
  }, [d.count, path, status]); // (d is updated in place, so d.count is what tells us it changed)
  const text = content ?? createdText;

  // ---- editor setup ----------------------------------------------------------------
  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decoRef.current = editor.createDecorationsCollection([]);
    defineIndulgentTheme(readThemeColors(), dark);
    monaco.editor.setTheme('indulgent');
  };

  // Re-theme the editor when the app theme changes.
  useEffect(() => {
    const c = readThemeColors();
    defineIndulgentTheme(c, dark);
    monaco.editor.setTheme('indulgent');
    editorRef.current?.updateOptions({ fontFamily: c.fontMono });
  }, [themeRev, dark]);

  // While Claude is mid-read, the cursor "scans" down the range, so tick regularly.
  const active = !!d.cursor?.active;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 80);
    return () => clearInterval(t);
  }, [active]);

  // ---- decorations: regions, search hits, cursor --------------------------------------
  useEffect(() => {
    const editor = editorRef.current;
    const coll = decoRef.current;
    const model = editor?.getModel();
    if (!editor || !coll || !model || !path || text === null) return coll?.clear();
    const colors = readThemeColors();
    const { now } = getView();
    const lineCount = model.getLineCount();
    const clamp = (n: number) => Math.min(Math.max(1, n), lineCount);
    const out: Array<Parameters<typeof coll.set>[0][number]> = [];

    const mark = (kind: Kind, start: number, end: number, fresh: string) => {
      out.push({
        range: new monaco.Range(clamp(start), 1, clamp(end), 1),
        options: {
          isWholeLine: true,
          className: `deco-region deco-${kind} ${fresh}`,
          linesDecorationsClassName: `deco-gutter deco-${kind}`,
          minimap: { color: colors.kind[kind], position: monaco.editor.MinimapPosition.Inline },
          overviewRuler: { color: colors.kind[kind], position: monaco.editor.OverviewRulerLane.Right },
        },
      });
    };

    // lines matched by the most recent Grep (only if that search found this file)
    if (d.touched.get(path)?.kinds.search) {
      const grep = [...d.chat].reverse().find((c) => c.type === 'tool' && c.tool === 'Grep');
      if (grep && grep.type === 'tool' && typeof grep.input.pattern === 'string') {
        try {
          const re = new RegExp(grep.input.pattern, grep.input['-i'] ? 'i' : '');
          let hits = 0;
          const lines = text.split('\n');
          for (let i = 0; i < lines.length && hits < 300; i++) if (re.test(lines[i])) (mark('search', i + 1, i + 1, 'l2'), hits++);
        } catch {
          /* not a valid regex in JavaScript terms: skip the highlight */
        }
      }
    }

    for (const r of d.regions.get(path) ?? []) mark(r.kind, r.start, r.end, freshness(now, r.ts, r.active));

    // Claude's cursor. While a Read is running it drifts down the range it is reading.
    const cur = d.cursor;
    let cursorLine = 0;
    if (cur && cur.path === path) {
      cursorLine = cur.line;
      if (cur.active && cur.endLine && cur.endLine > cur.line) cursorLine = Math.min(cur.endLine, cur.line + Math.floor((now - cur.ts) / 28));
      cursorLine = clamp(cursorLine);
      out.push({
        range: new monaco.Range(cursorLine, 1, cursorLine, 1),
        options: {
          isWholeLine: true,
          className: `deco-cursor ${cur.active ? 'live' : ''}`,
          glyphMarginClassName: 'deco-cursor-glyph',
          minimap: { color: colors.accent2, position: monaco.editor.MinimapPosition.Gutter },
          overviewRuler: { color: colors.accent2, position: monaco.editor.OverviewRulerLane.Full },
        },
      });
    }
    // A line you jumped to from a stack frame: highlighted red for a few seconds.
    if (jumpTo && jumpTo.path === path && Date.now() - jumpTo.ts < 6000) {
      const ln = clamp(jumpTo.line);
      out.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: true, className: 'deco-jump', minimap: { color: colors.bad, position: monaco.editor.MinimapPosition.Gutter } } });
      editor.revealLineInCenter(ln, monaco.editor.ScrollType.Smooth);
    }
    coll.set(out);

    // Keep the cursor in view (scrolling smoothly, but not on every tiny step).
    if (cursorLine && (Math.abs(cursorLine - lastReveal.current.line) > 3 || now - lastReveal.current.at > 1500)) {
      const visible = editor.getVisibleRanges()[0];
      if (!visible || cursorLine < visible.startLineNumber + 1 || cursorLine > visible.endLineNumber - 2) {
        editor.revealLineInCenterIfOutsideViewport(cursorLine, monaco.editor.ScrollType.Smooth);
        lastReveal.current = { line: cursorLine, at: now };
      }
    }
    // `d.count` changes with every event; `tick` drives the scanning cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.count, d, path, text, tick, themeRev, jumpTo]);

  const lineTotal = text ? text.split('\n').length : 0;
  const lang = path ? languageFor(path) : 'plaintext';
  const legend: Kind[] = ['read', 'search', 'edit', 'create'];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-accent-2" title={path ?? ''}>
          {path ?? 'no file yet'}
        </span>
        {path && (
          <span className="shrink-0 text-dim">
            {lang} · {lineTotal.toLocaleString()} lines
          </span>
        )}
        <button
          className={`btn btn-ghost !px-1.5 !py-0.5 text-xs ${follow ? 'border-accent text-accent-2' : ''}`}
          onClick={() => setFollow((f) => !f)}
          title={follow ? 'Following Claude. Click to pin this file.' : 'Pinned. Click to follow Claude again.'}
          aria-pressed={follow}
        >
          {follow ? <Crosshair size={13} /> : <Pin size={13} />} {follow ? 'following Claude' : 'pinned'}
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {!path && <Empty>Waiting for Claude to open a file. Or click one on the map.</Empty>}
        {path && status === 'binary' && <Empty>{path} is a binary file.</Empty>}
        {path && status === 'missing' && text === null && <Empty>{path} is not on disk{follow ? ' (deleted, or not written yet).' : '.'}</Empty>}
        {path && text !== null && (
          <Editor
            height="100%"
            path={`file:///${path}`}
            language={lang}
            value={text}
            theme="indulgent"
            onMount={onMount}
            loading={<div className="grid h-full place-items-center text-dim">Loading the editor…</div>}
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: true, renderCharacters: false, size: 'proportional', showSlider: 'always', maxColumn: 80 },
              fontFamily: readThemeColors().fontMono,
              fontSize: 12,
              lineHeight: 18,
              glyphMargin: true,
              folding: false,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              automaticLayout: true,
              padding: { top: 6, bottom: 6 },
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
              guides: { indentation: true },
              contextmenu: false,
            }}
          />
        )}
        {truncated && <div className="absolute bottom-1 left-2 rounded bg-surface/90 px-2 py-0.5 text-[0.68rem] text-warn">large file: showing the first 2 MB</div>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line px-2 py-1 text-[0.68rem]">
        {legend.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-1 rounded-sm" style={{ background: kindVar(k) }} />
            <span style={{ color: kindVar(k) }} className="font-semibold tracking-wide">
              {config.kindLabels[k]}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-accent-2">▶ Claude is here</span>
        <span className="ml-auto text-dim">the minimap on the right shows the whole file</span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center p-6 text-center text-dim">{children}</div>;
}
