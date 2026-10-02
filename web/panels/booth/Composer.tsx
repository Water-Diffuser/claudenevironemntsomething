// ============================================================================
//  The message box at the bottom of The Booth.
//    Enter = send, Shift+Enter = new line.
//    @   mention a file (or "@selection" for the lines you selected in the editor)
//    /   run a command: this app's own (/model, /new...) or Claude Code's (/compact...)
//  Under the box: permission, model and effort pickers, and Send / Stop.
// ============================================================================
import { ArrowUp, FileText, Square, TextSelect, Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { baseName } from '../../lib/format';
import { rankPaths } from '../../lib/fuzzy';
import { LOCAL_COMMANDS } from '../../lib/localCommands';
import { useEditor } from '../../state/editor';
import { useLabel } from '../../state/settings';
import { useScan } from '../../state/scan';
import { send, useApp, useView } from '../../state/store';
import { useUI } from '../../state/ui';
import { EffortPicker, ModelPicker, PermissionPicker } from './ComposerPickers';
import { Suggest, type Suggestion } from './Suggest';

/** What the cursor is in the middle of typing. */
type Trigger = { kind: 'mention'; query: string; start: number } | { kind: 'slash'; query: string } | null;

function findTrigger(text: string, caret: number): Trigger {
  const before = text.slice(0, caret);
  const slash = /^\/([\w:.-]*)$/.exec(before);
  if (slash) return { kind: 'slash', query: slash[1] };
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (mention) return { kind: 'mention', query: mention[1], start: before.length - mention[1].length - 1 };
  return null;
}

export function Composer() {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const server = useApp((s) => s.server);
  const conn = useApp((s) => s.conn);
  const producer = useLabel('producer');
  const files = useScan((s) => s.files);
  const tabs = useEditor((s) => s.tabs);
  const activeFile = useEditor((s) => s.active);
  const selection = useEditor((s) => s.selection);
  const selectedFile = useUI((s) => s.selectedFile);
  const busy = !!server?.busy;
  const replaying = useView((s) => !!s.replay);
  const ready = conn === 'open' && !!server?.cwd && !replaying;

  // Grow the box as you type (up to a limit).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  // ---- the "@" and "/" suggestions -------------------------------------------------
  const trigger = findTrigger(text, caret);
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    if (trigger.kind === 'mention') {
      const out: Suggestion[] = [];
      // Quick picks for what you are looking at in the editor.
      if (trigger.query === '' || 'selection'.startsWith(trigger.query.toLowerCase())) {
        if (selection) out.push({ id: '@selection', label: 'selection', hint: `${baseName(selection.path)} lines ${selection.startLine}-${selection.endLine}`, icon: <TextSelect size={13} /> });
      }
      const boost = new Set<string>([...tabs.map((t) => t.path), ...(selectedFile ? [selectedFile] : []), ...(activeFile ? [activeFile] : [])]);
      for (const p of rankPaths(trigger.query, files.keys(), boost, 8)) {
        const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
        out.push({ id: p, label: baseName(p), hint: dir, icon: <FileText size={13} /> });
      }
      return out;
    }
    const q = trigger.query.toLowerCase();
    const local = LOCAL_COMMANDS.filter((c) => c.name.startsWith(q) || (q.length > 1 && c.name.includes(q)));
    const localNames = new Set(LOCAL_COMMANDS.map((c) => c.name));
    const claude = (server?.commands ?? []).filter((c) => !localNames.has(c.name) && (c.name.toLowerCase().startsWith(q) || (q.length > 1 && c.name.toLowerCase().includes(q))));
    return [
      ...local.map((c) => ({ id: 'local:' + c.name, label: '/' + c.name, hint: c.description, icon: <Terminal size={13} /> })),
      ...claude.slice(0, 12).map((c) => ({ id: 'claude:' + c.name, label: '/' + c.name + (c.argumentHint ? ' ' + c.argumentHint : ''), hint: c.description })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, caret, files, tabs, selection, selectedFile, activeFile, server?.commands]);

  const popupOpen = suggestions.length > 0 && dismissedFor !== text;
  const clampedActive = Math.min(active, Math.max(0, suggestions.length - 1));

  const setTextAndCaret = (value: string, at = value.length) => {
    setText(value);
    setCaret(at);
    // put the cursor back after React has re-rendered the new text
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
  };

  const pick = (i: number) => {
    const it = suggestions[i];
    if (!it || !trigger) return;
    if (trigger.kind === 'mention') {
      let token = `@${it.id}`;
      if (it.id === '@selection' && selection) token = `@${selection.path}#L${selection.startLine}-${selection.endLine}`;
      else if (/\s/.test(it.id)) token = `@"${it.id}"`;
      const next = text.slice(0, trigger.start) + token + ' ' + text.slice(caret);
      setTextAndCaret(next, trigger.start + token.length + 1);
      return;
    }
    if (it.id.startsWith('local:')) {
      LOCAL_COMMANDS.find((c) => 'local:' + c.name === it.id)?.run();
      setTextAndCaret('');
    } else {
      setTextAndCaret('/' + it.id.slice('claude:'.length) + ' ');
    }
  };

  const submit = (value = text) => {
    if (!value.trim() || busy || !ready) return;
    send({ t: 'send', prompt: value });
    setText('');
    setCaret(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (popupOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedFor(text);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        // "/compact" + Enter on one of Claude's own commands just sends it. Everything else picks the highlighted row.
        const exact = trigger?.kind === 'slash' && suggestions.some((s) => s.id === `claude:${trigger.query}`) && !suggestions.some((s) => s.id === `local:${trigger.query}`);
        if (!(e.key === 'Enter' && exact)) {
          e.preventDefault();
          pick(clampedActive);
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative shrink-0 border-t border-line bg-bg-alt p-3">
      {popupOpen && trigger && <Suggest title={trigger.kind === 'mention' ? 'Files' : 'Commands'} items={suggestions} active={clampedActive} onPick={pick} onHover={setActive} />}

      <div className="rounded-lg border border-line bg-bg transition-colors focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_var(--c-accent-soft)]">
        <textarea
          ref={box}
          rows={2}
          className="block w-full min-w-0 resize-none border-0 bg-transparent px-3 pb-1 pt-3 text-base text-ink outline-none placeholder:text-dim disabled:opacity-60"
          value={text}
          disabled={!ready}
          placeholder={replaying ? 'Replaying the past. Choose "Back to live" to chat again.' : ready ? `${producer}, what should we make?  @ for files, / for commands` : 'Pick a project folder first…'}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setActive(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          aria-label="Message to Claude"
        />
        <div className="@container flex items-center gap-0.5 px-2 pb-2">
          <PermissionPicker />
          <ModelPicker />
          <EffortPicker />
          <div className="ml-auto flex items-center gap-1">
            {busy ? (
              <button className="btn btn-danger !px-2" onClick={() => send({ t: 'stop' })} title="Stop Claude" aria-label="Stop">
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button className="btn btn-primary !w-7 !px-0" disabled={!text.trim() || !ready} onClick={() => submit()} title="Send (Enter)" aria-label="Send">
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
