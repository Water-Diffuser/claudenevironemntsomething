// "Setlist": your sessions. Click one to reopen it, or start a fresh take.
import { GitBranch, Plus } from 'lucide-react';
import { send, useApp } from '../state/store';
import { useLabel } from '../state/settings';
import { timeAgo } from '../lib/format';

export function Setlist() {
  const sessions = useApp((s) => s.sessions);
  const server = useApp((s) => s.server);
  const label = useLabel('setlist');
  const newLabel = useLabel('newSession');
  const busy = !!server?.busy;

  return (
    <aside className="drawer-in flex h-full w-[var(--sidebar-w)] max-w-[88vw] flex-col overflow-hidden border-r border-line bg-surface shadow-[0_0_40px_rgb(0_0_0/0.5)]" aria-label={label}>
      <div className="flex h-[var(--head-h)] shrink-0 items-center gap-2 border-b border-line bg-bg-alt px-3">
        <h2 className="m-0 text-sm font-semibold text-ink">{label}</h2>
        <button className="btn btn-primary ml-auto !h-6 !px-2 text-xs" disabled={busy || !server?.cwd} onClick={() => send({ t: 'new_session' })}>
          <Plus size={13} /> {newLabel}
        </button>
      </div>
      <ul className="m-0 flex-1 list-none space-y-0.5 overflow-y-auto p-2">
        {sessions.length === 0 && <li className="p-3 text-sm text-dim">{server?.cwd ? 'Nothing here yet. Say something in the booth.' : 'Pick a project to see its takes.'}</li>}
        {sessions.map((s) => {
          const active = s.sessionId === server?.sessionId;
          return (
            <li key={s.sessionId}>
              <button
                disabled={busy}
                onClick={() => send({ t: 'resume', sessionId: s.sessionId })}
                className={`w-full rounded-md border-l-2 px-3 py-2 text-left transition disabled:opacity-60 ${active ? 'border-accent bg-surface-hi' : 'border-transparent hover:bg-surface-hi'}`}
              >
                <div className="line-clamp-2 text-sm leading-snug text-ink">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dim">
                  <span>{timeAgo(s.lastModified)}</span>
                  {s.gitBranch && (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch size={11} /> {s.gitBranch}
                    </span>
                  )}
                  {s.sessionId.startsWith('rehearsal-') && <span className="chip">rehearsal</span>}
                  {s.source === 'claude' && <span className="chip">from claude</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
