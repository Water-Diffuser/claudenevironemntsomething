// The little list that pops up above the message box when you type "@" (files) or "/" (commands).
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

export interface Suggestion {
  id: string;
  /** Main text, e.g. a file path or "/model". */
  label: ReactNode;
  /** Dim text after it, e.g. what a command does. */
  hint?: ReactNode;
  icon?: ReactNode;
}

export function Suggest({ title, items, active, onPick, onHover }: { title: string; items: Suggestion[]; active: number; onPick: (i: number) => void; onHover: (i: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  // keep the highlighted row in view when you arrow through a long list
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="menu absolute inset-x-0 bottom-full mb-2 !max-h-60" role="listbox" aria-label={title} ref={list}>
      <div className="menu-label eyebrow">{title}</div>
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === active}
          data-active={i === active}
          className="menu-item"
          // mousedown (not click) so the textarea keeps focus
          onMouseDown={(e) => (e.preventDefault(), onPick(i))}
          onMouseEnter={() => onHover(i)}
        >
          {it.icon && <span className="grid size-4 shrink-0 place-items-center text-dim">{it.icon}</span>}
          <span className="min-w-0 shrink-0 truncate font-mono text-ink">{it.label}</span>
          {it.hint && <span className="min-w-0 flex-1 truncate text-xs text-dim">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
