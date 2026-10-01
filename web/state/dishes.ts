// ============================================================================
//  dishes.ts: achievements ("Dishes"). Each dish is a rule that looks at the
//  session so far. The first time a rule becomes true you earn the dish: a toast
//  pops up and it goes into the Trophy Case (saved in your settings, forever).
//  To add a dish: add one object to DISHES below.
// ============================================================================
import { create } from 'zustand';
import { BellRing, Beef, ClipboardList, Flame, Pizza, Scissors, Star, Utensils, Wine, type LucideIcon } from 'lucide-react';
import type { Derived } from './derived';
import { useSettings } from './settings';

export interface DishDef {
  id: string;
  name: string;
  /** What you did, shown once earned. */
  blurb: string;
  /** A teaser shown while it is still locked. */
  hint: string;
  icon: LucideIcon;
  /** Returns true once the dish has been earned in this session. */
  test: (d: Derived) => boolean;
}

export const DISHES: DishDef[] = [
  { id: 'first-cut', name: 'First Cut', blurb: 'Claude made its first edit to your code.', hint: 'Let Claude change a file.', icon: Scissors, test: (d) => d.edits.length > 0 || d.stats.filesChanged.size > 0 },
  { id: 'well-done', name: 'Well Done', blurb: 'The tests passed.', hint: 'Get a green test run.', icon: Beef, test: (d) => d.testsPassed },
  { id: 'burnt', name: 'Burnt', blurb: 'Three failures in a row. It happens to the best kitchens.', hint: 'Something has to go wrong, three times running.', icon: Flame, test: (d) => d.streak.max >= 3 },
  { id: 'seconds', name: 'Seconds', blurb: 'Ten files changed in one session.', hint: 'Change ten different files.', icon: Utensils, test: (d) => d.stats.filesChanged.size >= 10 },
  { id: 'mise-en-place', name: 'Mise en Place', blurb: 'Claude planned the courses before cooking.', hint: 'Get Claude to write a menu (todo list).', icon: ClipboardList, test: (d) => d.todos.length > 0 },
  { id: 'clean-plate', name: 'Clean Plate', blurb: 'Every dish on the menu was served.', hint: 'Finish a menu of three or more items.', icon: Pizza, test: (d) => d.todos.length >= 3 && d.todos.every((t) => t.status === 'completed') },
  { id: 'tasters-choice', name: "Taster's Choice", blurb: 'Claude read ten different files.', hint: 'Let Claude read ten files.', icon: Wine, test: (d) => countRead(d) >= 10 },
  { id: 'order-up', name: 'Order Up', blurb: 'Claude made a git commit.', hint: 'Have Claude commit its work.', icon: BellRing, test: (d) => d.committed },
  { id: 'michelin', name: 'Michelin Material', blurb: 'Three full stars: nine menu items served.', hint: 'Earn all three stars.', icon: Star, test: (d) => d.served.size >= 9 },
];

function countRead(d: Derived): number {
  let n = 0;
  for (const t of d.touched.values()) if (t.kinds.read) n++;
  return n;
}

// ---- toasts ---------------------------------------------------------------------------------
export interface DishToast {
  id: string;
  dish: DishDef;
}

interface ToastStore {
  toasts: DishToast[];
  push: (dish: DishDef) => void;
  dismiss: (id: string) => void;
}

export const useDishToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(dish) {
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id: `${dish.id}-${Date.now()}`, dish }] }));
    const id = get().toasts[get().toasts.length - 1].id;
    setTimeout(() => get().dismiss(id), 6500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Callbacks other features (like sound) can hook into when a dish is earned. */
export const dishListeners: Array<(dish: DishDef) => void> = [];

/**
 * Check every locked dish against the session. `announce` = true for live events (show a toast);
 * false when loading an old session (earn them quietly).
 */
export function evaluateDishes(d: Derived, announce: boolean) {
  const { ui, update } = useSettings.getState();
  let next: Record<string, number> | null = null;
  for (const dish of DISHES) {
    if (ui.dishes[dish.id] !== undefined || next?.[dish.id] !== undefined) continue;
    if (dish.test(d)) {
      next = { ...(next ?? ui.dishes), [dish.id]: Date.now() };
      if (announce) {
        useDishToasts.getState().push(dish);
        for (const l of dishListeners) l(dish);
      }
    }
  }
  if (next) update({ dishes: next });
}
