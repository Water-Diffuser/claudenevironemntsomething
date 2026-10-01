// Shows what a tool call is about to do / did, in a friendly way instead of raw JSON.
// Used by the tool cards in the chat AND by the "May I?" popup.
import { useState } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { Markdown } from './Markdown';

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));

function Block({ children, tone }: { children: React.ReactNode; tone?: 'add' | 'del' }) {
  const toneClass = tone === 'add' ? 'bg-k-create/12 border-k-create/50' : tone === 'del' ? 'bg-k-delete/12 border-k-delete/50' : 'bg-bg/60 border-line';
  return <pre className={`m-0 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2 font-mono text-[0.78rem] leading-snug ${toneClass}`}>{children}</pre>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-2 text-[0.68rem] uppercase tracking-wider text-dim first:mt-0">{children}</div>;
}

/** Long text, collapsed to `max` characters until you click. */
export function Clamp({ text, max = 1500 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= max || open) return <>{text}</>;
  return (
    <>
      {text.slice(0, max)}
      <button className="ml-1 text-accent underline" onClick={() => setOpen(true)}>
        …show all ({text.length.toLocaleString()} chars)
      </button>
    </>
  );
}

export function ToolInput({ tool, input }: { tool: string; input: Record<string, unknown> }) {
  switch (tool) {
    case 'Bash':
      return (
        <Block>
          <span className="text-k-run">$ </span>
          <Clamp text={str(input.command)} />
        </Block>
      );
    case 'Edit':
      return (
        <>
          <Label>{str(input.file_path)}</Label>
          <Block tone="del"><Clamp text={str(input.old_string)} max={900} /></Block>
          <div className="h-1" />
          <Block tone="add"><Clamp text={str(input.new_string)} max={900} /></Block>
        </>
      );
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? (input.edits as Array<Record<string, unknown>>) : [];
      return (
        <>
          <Label>{str(input.file_path)}</Label>
          {edits.slice(0, 6).map((e, i) => (
            <div key={i} className="mb-2">
              <Block tone="del"><Clamp text={str(e.old_string)} max={500} /></Block>
              <div className="h-1" />
              <Block tone="add"><Clamp text={str(e.new_string)} max={500} /></Block>
            </div>
          ))}
          {edits.length > 6 && <div className="text-dim text-xs">…and {edits.length - 6} more edits</div>}
        </>
      );
    }
    case 'Write':
      return (
        <>
          <Label>{str(input.file_path)}</Label>
          <Block tone="add"><Clamp text={str(input.content)} max={1500} /></Block>
        </>
      );
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as Array<Record<string, unknown>>) : [];
      return (
        <ul className="m-0 list-none space-y-1 p-0">
          {todos.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {t.status === 'completed' ? <Check size={14} className="text-good" /> : t.status === 'in_progress' ? <Loader2 size={14} className="animate-spin text-warn" /> : <Circle size={14} className="text-dim" />}
              <span className={t.status === 'completed' ? 'text-dim line-through' : ''}>{str(t.content)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'ExitPlanMode':
      return <Markdown text={str(input.plan)} />;
    default: {
      const entries = Object.entries(input);
      if (entries.length === 0) return <div className="text-dim text-sm">(no details)</div>;
      return (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd className="m-0 break-words font-mono text-[0.78rem]">
                <Clamp text={typeof v === 'string' ? v : JSON.stringify(v)} max={600} />
              </dd>
            </div>
          ))}
        </dl>
      );
    }
  }
}
