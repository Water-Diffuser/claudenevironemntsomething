// ============================================================================
//  "The Menu": Claude's todo list, dressed as a multi-course menu.
//  Items are split into Appetizer / Main course / Dessert. When Claude ticks an
//  item off, a silver cloche lifts off the plate (the "plating" animation).
// ============================================================================
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import type { TodoItem } from '@shared/events';
import { dur } from '../../theme/motion';
import { useDerived } from '../../state/store';

const COURSES = ['Appetizer', 'Main course', 'Dessert'] as const;

/** Spread the items over the three courses (first third, middle, last third). */
function planCourses(items: TodoItem[]): Array<{ course: string; items: Array<{ item: TodoItem; index: number }> }> {
  const n = items.length;
  const out = COURSES.map((course) => ({ course: course as string, items: [] as Array<{ item: TodoItem; index: number }> }));
  items.forEach((item, index) => {
    const c = n <= 1 ? 1 : n === 2 ? (index === 0 ? 0 : 1) : index < n / 3 ? 0 : index >= (n * 2) / 3 ? 2 : 1;
    out[c].items.push({ item, index });
  });
  return out.filter((c) => c.items.length > 0);
}

/** A silver dome that lifts off a plate, revealing a check mark. */
function Cloche() {
  return (
    <motion.svg viewBox="0 0 40 30" width="30" height="22" className="shrink-0" aria-hidden initial={{ opacity: 1 }} animate={{ opacity: 1 }}>
      <ellipse cx="20" cy="26" rx="17" ry="3.2" style={{ fill: 'var(--c-text-dim)' }} opacity="0.55" />
      <motion.g initial={{ y: 0, opacity: 1, rotate: 0 }} animate={{ y: -14, opacity: 0, rotate: -12 }} transition={{ duration: dur(0.9), delay: dur(0.15), ease: 'easeOut' }} style={{ transformOrigin: '20px 22px' }}>
        <path d="M5 23 C5 9 35 9 35 23 Z" style={{ fill: 'var(--c-text)' }} opacity="0.9" />
        <circle cx="20" cy="9" r="2.4" style={{ fill: 'var(--c-text)' }} />
        <path d="M11 17 C12 13 16 11 19 11" fill="none" strokeWidth="1.6" strokeLinecap="round" style={{ stroke: 'var(--c-light)' }} opacity="0.7" />
      </motion.g>
      <motion.path d="M13 21 L18 25 L28 14" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--c-good)' }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: dur(0.4), delay: dur(0.6) }} />
    </motion.svg>
  );
}

export default function MenuPanel() {
  const d = useDerived();
  const items = d.todos;
  const prev = useRef<Map<string, TodoItem['status']>>(new Map());
  const [plating, setPlating] = useState<Set<string>>(new Set());

  // Notice items that just turned "completed" and play the plating animation for them.
  useEffect(() => {
    const justServed: string[] = [];
    for (const t of items) {
      const before = prev.current.get(t.content);
      if (t.status === 'completed' && before && before !== 'completed') justServed.push(t.content);
    }
    prev.current = new Map(items.map((t) => [t.content, t.status]));
    if (justServed.length === 0) return;
    setPlating((p) => new Set([...p, ...justServed]));
    const timer = setTimeout(() => setPlating((p) => new Set([...p].filter((x) => !justServed.includes(x)))), dur(1.8) * 1000 + 50);
    return () => clearTimeout(timer);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="empty">
        <h3 className="empty-title m-0 !text-lg">No menu tonight.</h3>
        <p className="m-0 max-w-[34ch] text-sm">When Claude makes a plan, the courses appear here, and each one is plated as it is finished.</p>
      </div>
    );
  }

  const served = items.filter((t) => t.status === 'completed').length;
  const courses = planCourses(items);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-md rounded-lg border border-line">
        <div className="px-5 py-4">
          <div className="text-center">
            <div className="font-display text-xl italic text-ink">Le menu</div>
            <div className="text-xs text-dim">chef's tasting, composed live</div>
            <div className="mx-auto my-3 h-px w-16 bg-line" />
          </div>
          {courses.map(({ course, items: list }) => (
            <section key={course} className="mb-3 last:mb-0">
              <h3 className="eyebrow m-0 mb-1 text-center">{course}</h3>
              <ul className="m-0 list-none space-y-1.5 p-0">
                <AnimatePresence initial={false}>
                  {list.map(({ item, index }) => {
                    const done = item.status === 'completed';
                    const active = item.status === 'in_progress';
                    return (
                      <motion.li key={`${index}:${item.content}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur(0.25) }} className={`flex items-center gap-2 rounded-md px-2 py-1 ${plating.has(item.content) ? 'bg-good/15' : ''}`}>
                        <span className="grid size-5 shrink-0 place-items-center">
                          {done ? <Check size={15} className="text-good" /> : active ? <Flame size={15} className="animate-pulse text-warn" /> : <span className="size-2 rounded-full border border-dim" />}
                        </span>
                        <span className={`min-w-0 flex-1 text-sm ${done ? 'text-dim line-through decoration-good/60' : ''} ${active ? 'text-ink' : ''}`}>{active && item.activeForm ? item.activeForm : item.content}</span>
                        <span className="mx-1 hidden min-w-4 flex-1 border-b border-dotted border-line sm:block" aria-hidden />
                        {plating.has(item.content) ? <Cloche /> : <span className="shrink-0 text-xs text-dim">{done ? 'served' : active ? 'plating' : 'ordered'}</span>}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          ))}
          <div className="mt-2 text-center text-xs text-dim">
            {served} of {items.length} served
          </div>
        </div>
      </div>
    </div>
  );
}
