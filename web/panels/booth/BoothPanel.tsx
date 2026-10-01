// "The Booth": chat with Claude. Streaming text, markdown, tool cards.
import { FolderOpen } from 'lucide-react';
import { useApp, useDerived } from '../../state/store';
import { useUI } from '../../state/ui';
import { ChatList } from './ChatList';
import { Composer } from './Composer';

export function BoothPanel() {
  const d = useDerived();
  const server = useApp((s) => s.server);
  const openPicker = useUI((s) => s.openPicker);

  if (!server?.cwd) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-display text-2xl text-accent-2 glow-text">The booth is quiet.</div>
        <p className="max-w-sm text-dim">Choose a project folder and the voice will step up to the mic.</p>
        <button className="btn btn-primary" onClick={() => openPicker(true)}>
          <FolderOpen size={16} /> Choose a project
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {d.chat.length === 0 && !d.busy ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="font-display text-xl text-accent-2 glow-text">Ready when you are.</div>
          <p className="max-w-sm text-sm text-dim">Ask for anything. Every file Claude touches will light up in the color code.</p>
        </div>
      ) : (
        <ChatList />
      )}
      <Composer showStarters={d.chat.length === 0} />
    </div>
  );
}
