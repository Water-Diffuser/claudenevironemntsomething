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
  const producer = useLabel('producer');
  const voice = useLabel('voice');
  const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur(0.22) } };

  switch (item.type) {
    case 'user':
      return (
        <motion.div {...enter} className="flex flex-col items-end">
          <div className="mb-0.5 text-[0.68rem] uppercase tracking-wider text-dim">{producer}</div>
          <div className="gloss max-w-[88%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm px-3 py-2 text-on-accent" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--c-accent) 85%, var(--c-light)), var(--c-accent))' }}>
            {item.text}
          </div>
        </motion.div>
      );
    case 'assistant':
      return (
        <motion.div {...enter} className="max-w-[94%]">
          <div className="mb-0.5 text-[0.68rem] uppercase tracking-wider text-accent-2">{voice}</div>
          <div className="rounded-lg rounded-tl-sm border border-line bg-surface/60 px-3 py-2">
            <Markdown text={item.text} />
          </div>
        </motion.div>
      );
    case 'tool':
      return (
        <motion.div {...enter}>
          <ToolCard item={item} />
        </motion.div>
      );
    case 'notice': {
      const tone = item.level === 'error' ? 'border-bad/60 bg-bad/10 text-bad' : item.level === 'warn' ? 'border-warn/60 bg-warn/10 text-warn' : 'border-line bg-surface/50 text-dim';
      const Icon = item.level === 'error' ? OctagonX : item.level === 'warn' ? AlertTriangle : Info;
      return (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
          <Icon size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{item.text}</span>
        </div>
      );
    }
    case 'turn':
      return (
        <div className="text-center text-xs text-dim">
          {item.ok ? 'served' : 'stopped'} in {fmtDuration(item.durationMs)}
          {item.turns ? ` · ${item.turns} steps` : ''}
          {item.costUsd ? ` · ${fmtCost(item.costUsd)}` : ''}
        </div>
      );
    case 'stopped':
      return <div className="text-center text-xs uppercase tracking-widest text-warn">stopped mid-song</div>;
  }
});

function Thinking() {
  const voice = useLabel('voice');
  return (
    <div className="flex items-center gap-2 text-sm text-dim" aria-live="polite">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="inline-block size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
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
      className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
    >
      {hidden > 0 && (
        <button className="btn btn-ghost mx-auto !py-1 text-xs" onClick={() => setShowAll(true)}>
          show {hidden} earlier messages
        </button>
      )}
      {items.map((item) => (
        <ChatRow key={item.id} item={item} />
      ))}
      {d.live && (
        <div className="max-w-[94%]">
          <div className="mb-0.5 text-[0.68rem] uppercase tracking-wider text-accent-2">{voice}</div>
          <div className="rounded-lg rounded-tl-sm border border-line bg-surface/60 px-3 py-2">
            <Markdown text={d.live.text} />
          </div>
        </div>
      )}
      {waitingForText && <Thinking />}
    </div>
  );
}
