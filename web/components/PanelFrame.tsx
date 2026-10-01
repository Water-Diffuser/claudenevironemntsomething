// The glossy frame around every panel: drag handle title bar + hide button.
import { EyeOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LabelKey } from '../state/settings';
import { useLabel, useSettings } from '../state/settings';

export function PanelFrame({ id, label, icon: Icon, children, actions }: { id: string; label: LabelKey; icon: LucideIcon; children: ReactNode; actions?: ReactNode }) {
  const title = useLabel(label);
  const ui = useSettings((s) => s.ui);
  const update = useSettings((s) => s.update);
  return (
    <section className="panel gloss" aria-label={title}>
      <div className="panel-head">
        <Icon size={14} />
        <span className="truncate">{title}</span>
        <div className="ml-auto flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {actions}
          <button className="rounded p-1 text-dim hover:text-ink" title="Hide this panel" aria-label={`Hide ${title}`} onClick={() => update({ hidden: [...ui.hidden, id] })}>
            <EyeOff size={13} />
          </button>
        </div>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
