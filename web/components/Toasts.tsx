// Small messages that pop up at the bottom and disappear on their own.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { dur } from '../theme/motion';
import { useApp } from '../state/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: dur(0.2) }}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${t.level === 'error' ? 'border-bad bg-surface text-bad' : 'border-line bg-surface text-ink'}`}
          >
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-dim hover:text-ink">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
