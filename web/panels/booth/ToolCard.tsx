// A collapsible card for one tool call: icon, what it did, how long it took, and details on click.
import { memo, useState } from 'react';
import { Ban, Check, ChevronRight, Loader2, ShieldQuestion, Square, X } from 'lucide-react';
import { useKindLabels } from '../../state/settings';
import { KindIcon, kindVar } from '../../components/KindIcon';
import { Clamp, ToolInput } from '../../components/ToolInput';
import type { ChatItem } from '../../state/derived';
import { fmtDuration } from '../../lib/format';

type ToolItem = Extract<ChatItem, { type: 'tool' }>;

function StatusIcon({ status }: { status: ToolItem['status'] }) {
  switch (status) {
    case 'waiting':
      return <ShieldQuestion size={14} className="animate-pulse text-accent" aria-label="waiting for permission" />;
    case 'running':
      return <Loader2 size={14} className="animate-spin text-warn" aria-label="running" />;
    case 'ok':
      return <Check size={14} className="text-good" aria-label="done" />;
    case 'denied':
      return <Ban size={14} className="text-warn" aria-label="denied" />;
    case 'stopped':
      return <Square size={13} className="text-dim" aria-label="stopped" />;
    default:
      return <X size={14} className="text-bad" aria-label="failed" />;
  }
}

export const ToolCard = memo(function ToolCard({ item }: { item: ToolItem }) {
  const kindLabels = useKindLabels();
  const [open, setOpen] = useState(false);
  const color = kindVar(item.toolKind);
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface text-sm" style={{ borderLeft: `2px solid ${color}`, marginLeft: item.parentToolId ? '1rem' : 0 }}>
      <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-hi" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={13} className={`shrink-0 text-dim transition-transform ${open ? 'rotate-90' : ''}`} />
        <KindIcon kind={item.toolKind} tool={item.tool} />
        <span className="shrink-0 text-ink">{item.tool}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-dim">{item.summary}</span>
        {item.durationMs !== undefined && item.status !== 'running' && <span className="shrink-0 text-xs text-dim">{fmtDuration(item.durationMs)}</span>}
        <StatusIcon status={item.status} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2">
          <div className="eyebrow" style={{ color }}>
            {kindLabels[item.toolKind]}
          </div>
          <ToolInput tool={item.tool} input={item.input} />
          {item.output !== undefined && item.output !== '' && (
            <>
              <div className="eyebrow">result</div>
              <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-2 font-mono text-xs leading-snug">
                <Clamp text={item.output} max={2500} />
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
});
