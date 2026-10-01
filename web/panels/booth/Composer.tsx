// The message box at the bottom of The Booth. Enter = send, Shift+Enter = new line.
import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { send, useApp, useView } from '../../state/store';
import { useLabel } from '../../state/settings';

const STARTERS = ['Give me a tour of this codebase', 'Find the riskiest file and explain why', 'Which parts have no tests?', 'Suggest one small improvement and do it'];

export function Composer({ showStarters }: { showStarters: boolean }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const server = useApp((s) => s.server);
  const conn = useApp((s) => s.conn);
  const producer = useLabel('producer');
  const busy = !!server?.busy;
  const replaying = useView((s) => !!s.replay);
  const ready = conn === 'open' && !!server?.cwd && !replaying;

  // Grow the box as you type (up to a limit).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [text]);

  const submit = (value = text) => {
    if (!value.trim() || busy || !ready) return;
    send({ t: 'send', prompt: value });
    setText('');
  };

  return (
    <div className="border-t border-line bg-bg-alt/50 p-2.5">
      {showStarters && ready && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button key={s} className="chip hover:border-accent hover:text-ink" onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          rows={1}
          className="field resize-none"
          value={text}
          disabled={!ready}
          placeholder={replaying ? 'Replaying the past. Press Live (in Playback) to chat again.' : ready ? `${producer}, what should we make? (Enter to send)` : 'Pick a project folder first…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message to Claude"
        />
        {busy ? (
          <button className="btn btn-danger shrink-0" onClick={() => send({ t: 'stop' })} title="Interrupt Claude">
            <Square size={15} fill="currentColor" /> Stop
          </button>
        ) : (
          <button className="btn btn-primary shrink-0" disabled={!text.trim() || !ready} onClick={() => submit()}>
            <Send size={15} /> Send
          </button>
        )}
      </div>
    </div>
  );
}
