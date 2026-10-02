// "The Booth": chat with Claude. Streaming text, markdown, tool cards.
import { ArrowRight, FolderOpen } from 'lucide-react';
import { config } from '@config';
import { send, useApp, useDerived, useView } from '../../state/store';
import { useUI } from '../../state/ui';
import { ChatList } from './ChatList';
import { Composer } from './Composer';

// One-click ways to begin, shown only while the conversation is empty.
const STARTERS = ['Give me a tour of this codebase', 'Find the riskiest file and explain why', 'Which parts have no tests?', 'Suggest one small improvement and do it'];

export function BoothPanel() {
  const d = useDerived();
  const server = useApp((s) => s.server);
  const replaying = useView((s) => !!s.replay);
  const openPicker = useUI((s) => s.openPicker);

  if (!server?.cwd) {
    return (
      <div className="empty">
        <h2 className="empty-title m-0">The booth is quiet.</h2>
        <p className="m-0 max-w-[24ch] text-sm">Choose a project and the voice will step up to the mic.</p>
        <button className="btn btn-primary mt-2" onClick={() => openPicker(true)}>
          <FolderOpen size={14} /> Choose a project
        </button>
      </div>
    );
  }

  const empty = d.chat.length === 0 && !d.busy;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto px-6 py-6">
          <div>
            <h2 className="empty-title m-0">Ready when you are.</h2>
            <p className="mt-1 text-sm text-dim">{config.app.tagline}</p>
          </div>
          {!replaying && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {STARTERS.map((s) => (
                <li key={s}>
                  <button className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-dim transition-colors hover:bg-surface-hi hover:text-ink" onClick={() => send({ t: 'send', prompt: s })} disabled={!!server.busy}>
                    <ArrowRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover:text-accent group-hover:opacity-100" />
                    <span>{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ChatList />
      )}
      <Composer />
    </div>
  );
}
