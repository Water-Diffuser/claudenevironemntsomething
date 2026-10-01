// "New dish unlocked" pop-ups (achievements).
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import { useDishToasts } from '../state/dishes';
import { useLabel } from '../state/settings';
import { dur } from '../theme/motion';

export function DishToasts() {
  const toasts = useDishToasts((s) => s.toasts);
  const dismiss = useDishToasts((s) => s.dismiss);
  const label = useLabel('dishes');
  return (
    <div className="pointer-events-none fixed right-4 top-[calc(var(--topbar-h)+var(--hud-h)+0.75rem)] z-[55] flex w-80 flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map(({ id, dish }) => {
          const Icon = dish.icon;
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: dur(0.35), type: 'spring', stiffness: 260, damping: 22 }}
              className="gloss glow pointer-events-auto flex items-center gap-3 rounded-xl border border-accent bg-surface px-3 py-2.5"
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-accent bg-accent/15 text-accent-2">
                <Icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[0.62rem] uppercase tracking-[0.18em] text-accent-2">
                  <Trophy size={11} /> {label} · new dish
                </div>
                <div className="font-display text-lg leading-tight">{dish.name}</div>
                <div className="text-xs text-dim">{dish.blurb}</div>
              </div>
              <button onClick={() => dismiss(id)} aria-label="Dismiss" className="self-start text-dim hover:text-ink">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
