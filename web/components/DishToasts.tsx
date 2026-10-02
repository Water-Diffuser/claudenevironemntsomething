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
    <div className="pointer-events-none fixed right-4 top-[calc(var(--topbar-h)+0.75rem)] z-[55] flex w-80 flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map(({ id, dish }) => {
          const Icon = dish.icon;
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: dur(0.22), ease: 'easeOut' }}
              className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-surface-hi px-3 py-2.5 shadow-[0_12px_32px_rgb(0_0_0/0.5)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-full border border-accent text-accent">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="eyebrow flex items-center gap-1 text-accent">
                  <Trophy size={11} /> {label}
                </div>
                <div className="font-display text-base leading-tight">{dish.name}</div>
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
