// ============================================================================
//  "The Pass": the code editor.
//
//    * a real, EDITABLE Monaco editor (the editor inside VS Code) with tabs
//    * Ctrl/Cmd+S saves. If the file changed on disk meanwhile (Claude, a
//      formatter...) you are asked instead of being overwritten
//    * a file explorer on the left (or sliding over the editor on narrow screens)
//    * "following Claude": the editor jumps to whichever file Claude is in, and
//      shows its cursor and what it read / searched / edited / created, in the
//      color code. Click a file yourself and it stays put ("pinned").
// ============================================================================
import Editor, { type OnMount } from '@monaco-editor/react';
import { Crosshair, PanelLeft, Pin, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Kind } from '@shared/events';
import { baseName } from '../../lib/format';
import { defineIndulgentTheme, languageFor, monaco } from '../../lib/monaco';
import { readThemeColors } from '../../lib/themeColors';
import { useElementSize } from '../../lib/useElementSize';
import { useBuffers } from '../../state/buffers';
import { useEditor } from '../../state/editor';
import { useScan } from '../../state/scan';
import { useSettings, useKindLabels } from '../../state/settings';
import { getView, useApp, useDerived, useView } from '../../state/store';
import { useUI } from '../../state/ui';
import { resolveTheme } from '../../theme/applyTheme';
import { useThemeRev } from '../../theme/themeRev';
import { kindVar } from '../../components/KindIcon';
import { FileTree } from './FileTree';

type CodeEditor = Parameters<OnMount>[0];

/** The explorer sits beside the editor when the panel is at least this wide (px); otherwise it slides over it. */
const INLINE_EXPLORER_MIN = 640;

/** How "fresh" a region is: l1 = just now, l2 = recent, l3 = older. */
function freshness(now: number, ts: number, active: boolean): string {
  if (active) return 'l1 live';
  const age = now - ts;
  return age < 15_000 ? 'l1' : age < 90_000 ? 'l2' : 'l3';
}

const modelUri = (path: string) => monaco.Uri.parse(`file:///${path}`);

/** Close a tab: forget its text and free its Monaco model. */
function closeTab(path: string) {
  useEditor.getState().close(path);
  useBuffers.getState().forget(path);
  monaco.editor.getModel(modelUri(path))?.dispose();
}

export default function CodePanel() {
  const kindLabels = useKindLabels();
  const d = useDerived();
  const replaying = useView((s) => !!s.replay);
  const selectTick = useUI((s) => s.selectTick);
  const jumpTo = useUI((s) => s.jumpTo);
  const themeRev = useThemeRev((s) => s.rev);
  const themeSettings = useSettings((s) => s.ui.theme);
  const explorerOpen = useSettings((s) => s.ui.explorerOpen);
  const updateSettings = useSettings((s) => s.update);
  const dark = useMemo(() => resolveTheme(themeSettings).dark, [themeSettings]);

  const tabs = useEditor((s) => s.tabs);
  const active = useEditor((s) => s.active);
  const follow = useEditor((s) => s.follow);
  const dirty = useEditor((s) => s.dirty);
  const buffer = useBuffers((s) => (active ? s.buffers[active] : undefined));

  const { ref: boxRef, width } = useElementSize<HTMLDivElement>();
  const [tick, setTick] = useState(0);
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const editorRef = useRef<CodeEditor | null>(null);
  const decoIds = useRef<Map<string, string[]>>(new Map()); // decorations we put on each file's Monaco model
  const lastReveal = useRef({ line: 0, at: 0 });
  const inline = width >= INLINE_EXPLORER_MIN;

  // ---- opening files ---------------------------------------------------------------
  // Picking a file on the map/graph/diff opens it here (and pins it).
  useEffect(() => {
    const path = useUI.getState().selectedFile;
    if (!selectTick || !path) return;
    const editor = useEditor.getState();
    editor.setFollow(false);
    editor.open(path, { preview: true });
  }, [selectTick]);
  // Jumping to a line (from a stack frame) re-checks the highlight for a few seconds.
  useEffect(() => {
    if (!jumpTo) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const stop = setTimeout(() => clearInterval(t), 6500);
    return () => (clearInterval(t), clearTimeout(stop));
  }, [jumpTo]);

  // Following Claude: open the file its cursor is in (but never yank you away from a file with unsaved edits).
  const cursorPath = d.cursor?.path ?? null;
  useEffect(() => {
    if (!follow || !cursorPath) return;
    const editor = useEditor.getState();
    if (editor.active && editor.dirty[editor.active] && editor.active !== cursorPath) return;
    editor.open(cursorPath, { preview: true });
  }, [follow, cursorPath]);

  // Make sure the active file's text is loaded.
  useEffect(() => {
    if (active) void useBuffers.getState().load(active);
  }, [active]);

  // When the file watcher reports that an open file changed on disk, refresh it (or flag a conflict).
  useEffect(() => {
    const last = new Map<string, unknown>();
    const check = () => {
      const { files } = useScan.getState();
      for (const t of useEditor.getState().tabs) {
        const info = files.get(t.path);
        if (last.has(t.path) && last.get(t.path) !== info) void useBuffers.getState().refresh(t.path);
        last.set(t.path, info);
      }
    };
    check();
    return useScan.subscribe(check);
  }, []);

  // ---- the text to show ---------------------------------------------------------------
  // If Claude "created" a file that is not on disk (a rehearsal pretends), show what it wrote, read-only.
  const virtualText = useMemo(() => {
    if (!active || buffer?.status !== 'missing') return null;
    const edit = [...d.edits].reverse().find((e) => e.path === active && e.type === 'create');
    return edit ? edit.hunks.flatMap((h) => h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1))).join('\n') : null;
  }, [d.count, active, buffer?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = buffer?.status === 'ok' ? buffer.text : virtualText;
  const readOnly = replaying || buffer?.status !== 'ok' || !!buffer?.truncated;
  const lang = active ? languageFor(active) : 'plaintext';

  // ---- saving ------------------------------------------------------------------------------
  const save = async (path = useEditor.getState().active) => {
    if (!path) return;
    const res = await useBuffers.getState().save(path);
    if (!res.ok && !res.conflict) useApp.getState().toast(res.error, 'error');
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Ctrl/Cmd+S saves. It is caught on the whole window (not just inside Monaco), so it still works after you
  // click a button, and so the browser's own "Save page as..." never pops up while you are in this app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- editor setup ----------------------------------------------------------------
  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    defineIndulgentTheme(readThemeColors(), dark);
    monaco.editor.setTheme('indulgent');
    // Cursor position, and which lines are selected (for "@selection" in the message box).
    editor.onDidChangeCursorSelection((e) => {
      const path = useEditor.getState().active;
      setPos({ line: e.selection.positionLineNumber, col: e.selection.positionColumn });
      useEditor.getState().setSelection(path && !e.selection.isEmpty() ? { path, startLine: e.selection.startLineNumber, endLine: e.selection.endLineNumber } : null);
    });
  };

  // Re-theme the editor when the app theme changes.
  useEffect(() => {
    const c = readThemeColors();
    defineIndulgentTheme(c, dark);
    monaco.editor.setTheme('indulgent');
    editorRef.current?.updateOptions({ fontFamily: c.fontMono });
  }, [themeRev, dark]);

  // While Claude is mid-read, the cursor "scans" down the range, so tick regularly.
  const cursorActive = !!d.cursor?.active;
  useEffect(() => {
    if (!cursorActive) return;
    const t = setInterval(() => setTick((n) => n + 1), 80);
    return () => clearInterval(t);
  }, [cursorActive]);

  // ---- decorations: regions, search hits, Claude's cursor ----------------------------------
  // (They are set on the file's own Monaco model, so each tab keeps its own marks.)
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !active || text === null || model.uri.path !== `/${active}`) return;
    const colors = readThemeColors();
    const { now } = getView();
    const lineCount = model.getLineCount();
    const clamp = (n: number) => Math.min(Math.max(1, n), lineCount);
    const out: Parameters<typeof model.deltaDecorations>[1] = [];

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
    if (d.touched.get(active)?.kinds.search) {
      const grep = [...d.chat].reverse().find((c) => c.type === 'tool' && c.tool === 'Grep');
      if (grep && grep.type === 'tool' && typeof grep.input.pattern === 'string') {
        try {
          const re = new RegExp(grep.input.pattern, grep.input['-i'] ? 'i' : '');
          let hits = 0;
          const lines = model.getValue().split('\n');
          for (let i = 0; i < lines.length && hits < 300; i++) if (re.test(lines[i])) (mark('search', i + 1, i + 1, 'l2'), hits++);
        } catch {
          /* not a valid regex in JavaScript terms: skip the highlight */
        }
      }
    }

    for (const r of d.regions.get(active) ?? []) mark(r.kind, r.start, r.end, freshness(now, r.ts, r.active));

    // Claude's cursor. While a Read is running it drifts down the range it is reading.
    const cur = d.cursor;
    let cursorLine = 0;
    if (cur && cur.path === active) {
      cursorLine = cur.line;
      if (cur.active && cur.endLine && cur.endLine > cur.line) cursorLine = Math.min(cur.endLine, cur.line + Math.floor((now - cur.ts) / 28));
      cursorLine = clamp(cursorLine);
      out.push({
        range: new monaco.Range(cursorLine, 1, cursorLine, 1),
        options: {
          isWholeLine: true,
          className: `deco-cursor ${cur.active ? 'live' : ''}`,
          glyphMarginClassName: 'deco-cursor-glyph',
          minimap: { color: colors.accent, position: monaco.editor.MinimapPosition.Gutter },
          overviewRuler: { color: colors.accent, position: monaco.editor.OverviewRulerLane.Full },
        },
      });
    }
    // A line you jumped to from a stack frame: highlighted red for a few seconds.
    if (jumpTo && jumpTo.path === active && Date.now() - jumpTo.ts < 6000) {
      const ln = clamp(jumpTo.line);
      out.push({ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: true, className: 'deco-jump', minimap: { color: colors.bad, position: monaco.editor.MinimapPosition.Gutter } } });
      editor.revealLineInCenter(ln, monaco.editor.ScrollType.Smooth);
    }
    decoIds.current.set(active, model.deltaDecorations(decoIds.current.get(active) ?? [], out));

    // Keep Claude's cursor in view while following (scrolling smoothly, but not on every tiny step).
    if (follow && cursorLine && (Math.abs(cursorLine - lastReveal.current.line) > 3 || now - lastReveal.current.at > 1500)) {
      const visible = editor.getVisibleRanges()[0];
      if (!visible || cursorLine < visible.startLineNumber + 1 || cursorLine > visible.endLineNumber - 2) {
        editor.revealLineInCenterIfOutsideViewport(cursorLine, monaco.editor.ScrollType.Smooth);
        lastReveal.current = { line: cursorLine, at: now };
      }
    }
    // `d.count` changes with every event; `tick` drives the scanning cursor. We re-mark when the disk text
    // changes (buffer.saved), not on every key you type: Monaco moves the marks along with your edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.count, d, active, buffer?.saved, text === null, tick, themeRev, jumpTo, follow]);

  // ---- layout bits -------------------------------------------------------------------------
  const showExplorer = explorerOpen;
  const names = tabs.map((t) => baseName(t.path));
  const label = (path: string) => (names.filter((n) => n === baseName(path)).length > 1 ? path.split('/').slice(-2).join('/') : baseName(path));
  const lineTotal = text ? text.split('\n').length : 0;
  const isDirty = !!(active && dirty[active]);
  const legend: Kind[] = ['read', 'search', 'edit', 'create'];

  const tabStrip = (
    <div className="panel-head !pl-1 !pr-1">
      <button className="icon-btn icon-btn-sm" aria-pressed={showExplorer} aria-label="Files" title="Files" onClick={() => updateSettings({ explorerOpen: !showExplorer })}>
        <PanelLeft size={15} />
      </button>
      <div className="tabs flex-1" role="tablist" aria-label="Open files">
        {tabs.map((t) => {
          const selectedTab = t.path === active;
          return (
            <div
              key={t.path}
              role="tab"
              tabIndex={0}
              aria-selected={selectedTab}
              title={t.path}
              className="tab group cursor-pointer"
              onClick={() => useEditor.getState().setActive(t.path)}
              onAuxClick={(e) => e.button === 1 && closeTab(t.path)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), useEditor.getState().setActive(t.path))}
            >
              <span className={t.preview ? 'italic' : ''}>{label(t.path)}</span>
              {dirty[t.path] ? <span className="size-1.5 rounded-full bg-accent group-hover:hidden" title="Unsaved changes" /> : null}
              <button
                className={`grid size-4 place-items-center rounded text-dim hover:bg-surface-hi hover:text-ink ${dirty[t.path] ? 'hidden group-hover:grid' : selectedTab ? '' : 'opacity-0 group-hover:opacity-100'}`}
                aria-label={`Close ${baseName(t.path)}`}
                onClick={(e) => (e.stopPropagation(), closeTab(t.path))}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className={`icon-btn icon-btn-sm ${follow ? 'is-on' : ''}`}
        aria-pressed={follow}
        aria-label={follow ? 'Following Claude' : 'Pinned'}
        title={follow ? 'Following Claude. Click to stay on this file.' : 'Pinned. Click to follow Claude again.'}
        onClick={() => useEditor.getState().setFollow(!follow)}
      >
        {follow ? <Crosshair size={14} /> : <Pin size={14} />}
      </button>
      <button className="icon-btn icon-btn-sm" disabled={!isDirty || readOnly || buffer?.saving} aria-label="Save" title="Save (Ctrl+S)" onClick={() => void save()}>
        <Save size={14} />
      </button>
    </div>
  );

  return (
    <div ref={boxRef} className="relative flex h-full min-h-0">
      {/* the explorer, beside the editor when there is room... */}
      {showExplorer && inline && (
        <div className="w-[15rem] shrink-0 border-r border-line">
          <FileTree onClose={() => updateSettings({ explorerOpen: false })} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {tabStrip}

        {/* a file changed on disk while you have unsaved edits: you decide */}
        {buffer?.changedOnDisk && active && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-warn/10 px-3 py-1.5 text-xs text-warn">
            <span className="min-w-0 flex-1">This file changed on disk while you were editing it.</span>
            <button className="btn !h-6 !px-2 text-xs" onClick={() => void useBuffers.getState().reload(active)}>
              Reload
            </button>
            <button className="btn !h-6 !px-2 text-xs" onClick={() => void useBuffers.getState().keepMine(active)}>
              Keep mine
            </button>
          </div>
        )}
        {buffer?.truncated && <div className="shrink-0 border-b border-line bg-warn/10 px-3 py-1.5 text-xs text-warn">Large file: showing the first 2 MB. It is read-only here.</div>}

        <div className="relative min-h-0 flex-1">
          {!active && (
            <div className="empty">
              <h3 className="empty-title m-0 !text-lg">No file open.</h3>
              <p className="m-0 max-w-[30ch] text-sm">Pick one from the file list, or wait for Claude to open one.</p>
              {!showExplorer && (
                <button className="btn mt-1" onClick={() => updateSettings({ explorerOpen: true })}>
                  <PanelLeft size={14} /> Show files
                </button>
              )}
            </div>
          )}
          {active && buffer?.status === 'loading' && <div className="empty text-xs">Opening…</div>}
          {active && buffer?.status === 'binary' && <div className="empty">{baseName(active)} is a binary file.</div>}
          {active && buffer?.status === 'missing' && text === null && <div className="empty">{baseName(active)} is not on disk{follow ? ' (deleted, or not written yet).' : '.'}</div>}
          {active && text !== null && (
            <Editor
              height="100%"
              path={`file:///${active}`}
              language={lang}
              value={text}
              theme="indulgent"
              keepCurrentModel
              onMount={onMount}
              onChange={(value) => !readOnly && useBuffers.getState().edit(active, value ?? '')}
              loading={<div className="empty text-xs">Loading the editor…</div>}
              options={{
                readOnly,
                minimap: { enabled: width >= 520, renderCharacters: false, size: 'proportional', showSlider: 'mouseover', maxColumn: 60 },
                fontFamily: readThemeColors().fontMono,
                fontSize: 12,
                lineHeight: 19,
                glyphMargin: true,
                folding: true,
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                renderLineHighlight: readOnly ? 'none' : 'line',
                overviewRulerBorder: false,
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                guides: { indentation: true },
                contextmenu: true,
                fixedOverflowWidgets: true,
              }}
            />
          )}

          {/* ...or sliding over it when the panel is narrow */}
          {showExplorer && !inline && (
            <>
              <div className="absolute inset-0 z-10 bg-shade/40" onClick={() => updateSettings({ explorerOpen: false })} aria-hidden />
              <div
                className="drawer-in absolute inset-y-0 left-0 z-20 w-[16rem] max-w-[85%] border-r border-line bg-surface shadow-[0_0_30px_rgb(0_0_0/0.5)]"
                onKeyDown={(e) => e.key === 'Escape' && updateSettings({ explorerOpen: false })}
              >
                <FileTree onPick={() => updateSettings({ explorerOpen: false })} onClose={() => updateSettings({ explorerOpen: false })} />
              </div>
            </>
          )}
        </div>

        {/* a slim status line: language, position, and what the colors in the left edge mean */}
        <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-bg-alt px-3 text-xs text-dim">
          {active ? (
            <>
              <span className="min-w-0 truncate" title={active}>
                {lang}
              </span>
              {text !== null && <span>Ln {pos.line}, Col {pos.col}</span>}
              {text !== null && <span className="max-md:hidden">{lineTotal.toLocaleString()} lines</span>}
              {isDirty && <span className="text-accent">unsaved</span>}
              {buffer?.saving && <span>saving…</span>}
            </>
          ) : (
            <span>&nbsp;</span>
          )}
          <span className="ml-auto flex items-center gap-1.5" title="Colors along the left edge: what Claude read, searched, edited or created in this file. The pink arrow is where Claude is now.">
            {legend.map((k) => (
              <span key={k} className="size-2 rounded-sm" style={{ background: kindVar(k) }} aria-label={kindLabels[k]} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
