// ============================================================================
//  Menu: a small dropdown. Used by the model picker, the layout switcher, the
//  "+" in the dock, and so on.
//
//  How it works:
//    * <Menu trigger={...}>{(close) => <MenuItem .../>}</Menu>
//    * The menu is drawn in a "portal" (straight into <body>) and positioned with
//      `position: fixed`. That way a panel with `overflow: hidden` can never clip it.
//    * Arrow keys move between items, Escape closes, clicking elsewhere closes.
// ============================================================================
import { Check } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MenuProps {
  /** Accessible name of the menu. */
  label: string;
  /** Draw the button that opens the menu. `toggle` opens/closes it. */
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
  /** The menu content. Call `close()` after an action to dismiss the menu. */
  children: (close: () => void) => ReactNode;
  /** Open above ("top") or below ("bottom") the button. */
  side?: 'top' | 'bottom';
  /** Line the menu up with the button's left edge ("start") or right edge ("end"). */
  align?: 'start' | 'end';
  /** Minimum width in rem. */
  minWidth?: number;
  /** Optional: control the open state from outside (so a "/model" command can open the model menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface Placement {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const ITEM = '[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled)';

export function Menu({ label, trigger, children, side = 'bottom', align = 'start', minWidth = 13, open: openProp, onOpenChange }: MenuProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = useCallback(
    (next: boolean | ((o: boolean) => boolean)) => {
      const value = typeof next === 'function' ? next(open) : next;
      setInnerOpen(value);
      onOpenChange?.(value);
    },
    [open, onOpenChange],
  );
  const [place, setPlace] = useState<Placement | null>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen((o) => !o), [setOpen]);

  // Work out where to draw the menu, from where the button is on screen.
  useLayoutEffect(() => {
    if (!open || !holder.current) return setPlace(null);
    const r = holder.current.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    // If a left-aligned menu would run off the right side of the window, flip it.
    const flip = align === 'start' && r.left + minWidth * 13 * 1.2 > window.innerWidth;
    const alignEnd = align === 'end' || flip;
    setPlace({
      ...(alignEnd ? { right: Math.max(edge, window.innerWidth - r.right) } : { left: Math.max(edge, r.left) }),
      ...(side === 'top' ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
      maxHeight: Math.max(160, (side === 'top' ? r.top : window.innerHeight - r.bottom) - gap - edge),
    });
  }, [open, side, align, minWidth]);

  // Once it is on screen: focus the checked item (or the first one).
  useEffect(() => {
    if (!open || !place) return;
    const items = menu.current?.querySelectorAll<HTMLElement>(ITEM);
    const checked = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
  }, [open, place]);

  // Close when you click elsewhere, scroll, or resize.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !holder.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      holder.current?.querySelector<HTMLElement>('button')?.focus();
      return;
    }
    if (e.key === 'Tab') return close();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  return (
    <>
      <span ref={holder} className="inline-flex">
        {trigger({ open, toggle })}
      </span>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            className="menu fixed"
            style={{ ...place, minWidth: `${minWidth}rem`, visibility: place ? 'visible' : 'hidden' }}
            onKeyDown={onKeyDown}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

/** One row in a menu. Pass `checked` to make it a radio-style choice with a tick. */
export function MenuItem({
  children,
  hint,
  icon,
  checked,
  danger,
  onSelect,
  ...rest
}: {
  children: ReactNode;
  /** Small dim text under the label. */
  hint?: ReactNode;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  onSelect: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  const radio = checked !== undefined;
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? checked : undefined}
      className={`menu-item ${danger ? 'text-bad' : ''}`}
      onClick={onSelect}
      {...rest}
    >
      {icon && <span className="grid size-4 shrink-0 place-items-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {hint && <span className="block whitespace-normal text-xs text-dim">{hint}</span>}
      </span>
      {radio && <Check size={14} className={`shrink-0 ${checked ? 'opacity-100' : 'opacity-0'}`} aria-hidden />}
    </button>
  );
}

export const MenuSeparator = () => <div className="menu-sep" role="separator" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="menu-label eyebrow">{children}</div>;
