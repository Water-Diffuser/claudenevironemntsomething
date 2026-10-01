// The "May I?" popup. Claude wants to do something that needs your OK.
// Esc = Deny. Also handles Claude's multiple-choice questions.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ShieldQuestion, X } from 'lucide-react';
import { config } from '@config';
import type { PermissionRequest } from '@shared/protocol';
import { dur } from '../theme/motion';
import { send, useApp } from '../state/store';
import { useLabel } from '../state/settings';
import { KindIcon, kindVar } from './KindIcon';
import { ToolInput } from './ToolInput';

const VERB: Record<string, string> = {
  edit: 'edit a file',
  create: 'create a new file',
  delete: 'delete something',
  run: 'run a command',
  read: 'read a file',
  search: 'search',
  other: 'use a tool',
};

function reply(req: PermissionRequest, decision: 'allow' | 'allow_always' | 'deny', answers?: Record<string, string>) {
  send({ t: 'permission_reply', requestId: req.requestId, decision, answers });
}

/** Claude is asking you a multiple-choice question. */
function QuestionBody({ req }: { req: PermissionRequest }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const qs = req.questions ?? [];
  const complete = qs.every((q) => (picked[q.question]?.length ?? 0) > 0);
  const toggle = (q: string, label: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[q] ?? [];
      return { ...p, [q]: multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label] };
    });
  return (
    <>
      <div className="max-h-[50vh] space-y-4 overflow-y-auto px-5 py-4">
        {qs.map((q) => (
          <div key={q.question}>
            {q.header && <div className="mb-1 text-[0.68rem] uppercase tracking-wider text-accent-2">{q.header}</div>}
            <div className="mb-2 font-semibold">{q.question}</div>
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const on = picked[q.question]?.includes(o.label);
                return (
                  <button
                    key={o.label}
                    onClick={() => toggle(q.question, o.label, !!q.multiSelect)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${on ? 'border-accent bg-accent/15' : 'border-line hover:border-accent-2'}`}
                  >
                    <div className="font-semibold">{o.label}</div>
                    {o.description && <div className="text-sm text-dim">{o.description}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button className="btn btn-danger" onClick={() => reply(req, 'deny')}>
          Skip
        </button>
        <button
          className="btn btn-primary"
          disabled={!complete}
          onClick={() => reply(req, 'allow', Object.fromEntries(Object.entries(picked).map(([q, a]) => [q, a.join(', ')])))}
        >
          <Check size={16} /> Answer
        </button>
      </div>
    </>
  );
}

export function PermissionDialog() {
  const pending = useApp((s) => s.pending);
  const label = useLabel('permission');
  const req = pending[0];

  // Esc = deny (the safe choice).
  useEffect(() => {
    if (!req || req.questions) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && reply(req, 'deny');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  const isPlan = req?.tool === 'ExitPlanMode';
  return (
    <AnimatePresence>
      {req && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'color-mix(in srgb, var(--c-shade) 62%, transparent)', backdropFilter: 'blur(5px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur(0.18) }}
        >
          <motion.div
            key={req.requestId}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="gloss glow w-full max-w-xl overflow-hidden rounded-xl border border-accent bg-surface"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: dur(0.26), ease: 'easeOut' }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${kindVar(req.toolKind)} 22%, transparent), transparent)` }}>
              <ShieldQuestion size={30} className="shrink-0 text-accent" />
              <div className="min-w-0">
                <div className="glitch glow-text font-display text-3xl leading-none text-accent-2" data-text={label}>
                  {label}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-dim">
                  <KindIcon kind={req.toolKind} tool={req.tool} size={14} />
                  {req.questions ? 'Claude has a question for you' : isPlan ? 'Claude has a plan and wants the green light' : req.title ?? `Claude would like to ${VERB[req.toolKind] ?? 'use a tool'}`}
                </div>
              </div>
              {pending.length > 1 && <span className="chip ml-auto shrink-0">+{pending.length - 1} waiting</span>}
            </div>

            {req.questions ? (
              <QuestionBody req={req} />
            ) : (
              <>
                <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-semibold">{req.tool}</span>
                    <span className="chip !py-0" style={{ color: kindVar(req.toolKind) }}>
                      {config.kindLabels[req.toolKind]}
                    </span>
                  </div>
                  {req.description && <p className="mb-2 text-sm text-dim">{req.description}</p>}
                  <ToolInput tool={req.tool} input={req.input} />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
                  <span className="mr-auto hidden text-xs text-dim sm:inline">Esc = deny</span>
                  <button className="btn btn-danger" onClick={() => reply(req, 'deny')}>
                    <X size={16} /> {isPlan ? 'Keep planning' : 'Deny'}
                  </button>
                  {req.canAlwaysAllow && !isPlan && (
                    <button className="btn btn-ghost" onClick={() => reply(req, 'allow_always')} title="Allow this, and stop asking about similar requests">
                      Allow &amp; don't ask again
                    </button>
                  )}
                  <button className="btn btn-primary" autoFocus onClick={() => reply(req, 'allow')}>
                    <Check size={16} /> {isPlan ? 'Approve plan' : 'Allow'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
