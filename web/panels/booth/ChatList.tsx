// The scrolling transcript: your messages, Claude's streaming text, tool cards, notices.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Info, OctagonX } from 'lucide-react';
import { config } from '@config';
import { Markdown } from '../../components/Markdown';
import { dur } from '../../theme/motion';
import { fmtCost, fmtDuration } from '../../lib/format';
import { useLabel } from '../../state/settings';
import { useDerived } from '../../state/store';
import type { ChatItem } from '../../state/derived';
import { ToolCard } from './ToolCard';

const ChatRow = memo(function ChatRow({ item }: { item: ChatItem }) {
  const voice = useLabel('voice');
  const enter = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur(0.18) } };

  switch (item.type) {
    case 'user':
      // you: a quiet box in the interface font
      return (
        <motion.div {...enter} className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-hi px-3 py-2 text-sm text-ink">
          {item.text}
        </motion.div>
      );
    case 'assistant':
      // Claude: plain serif prose, no box
      return (
        <motion.div {...enter}>
          <div className="eyebrow mb-1">{voice}</div>
          <Markdown text={item.text} />
        </motion.div>
      );
    case 'tool':
      return (
        <motion.div {...enter}>
          <ToolCard item={item} />
        </motion.div>
      );
    case 'notice': {
      const tone = item.level === 'error' ? 'border-bad/50 text-bad' : item.level === 'warn' ? 'border-warn/50 text-warn' : 'border-line text-dim';
      const Icon = item.level === 'error' ? OctagonX : item.level === 'warn' ? AlertTriangle : Info;
      return (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
          <Icon size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{item.text}</span>
        </div>
      );
    }
    case 'turn':
      return (
        <div className="text-xs text-dim">
          {item.ok ? 'Done' : 'Stopped'} in {fmtDuration(item.durationMs)}
          {item.turns ? ` · ${item.turns} steps` : ''}
          {item.costUsd ? ` · ${fmtCost(item.costUsd)}` : ''}
        </div>
      );
    case 'stopped':
      return <div className="eyebrow text-warn">stopped</div>;
  }
});

function Thinking() {
  const voice = useLabel('voice');
  return (
    <div className="flex items-center gap-2 text-sm text-dim" aria-live="polite">
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
      {voice} is thinking…
    </div>
  );
}

export function ChatList() {
  const d = useDerived();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showAll, setShowAll] = useState(false);
  const voice = useLabel('voice');

  const items = showAll ? d.chat : d.chat.slice(-config.limits.chatWindow);
  const hidden = d.chat.length - items.length;
  const last = d.chat[d.chat.length - 1];
  const waitingForText = d.busy && !d.live && !(last?.type === 'tool' && (last.status === 'running' || last.status === 'waiting'));

  // Keep the view pinned to the bottom unless you scroll up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stick.current = true;
  }, [d.sessionId]);

  return (
    <div
      ref={scroller}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
    >
      {hidden > 0 && (
        <button className="btn btn-ghost mx-auto text-xs" onClick={() => setShowAll(true)}>
          show {hidden} earlier messages
        </button>
      )}
      {items.map((item) => (
        <ChatRow key={item.id} item={item} />
      ))}
      {d.live && (
        <div>
          <div className="eyebrow mb-1">{voice}</div>
          <Markdown text={d.live.text} />
        </div>
      )}
      {waitingForText && <Thinking />}
    </div>
  );
}
