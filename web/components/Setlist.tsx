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
    <aside className="gloss flex h-full w-[var(--sidebar-w)] shrink-0 flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-surface/80">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="m-0 font-display text-sm uppercase tracking-[0.08em] text-accent-2">{label}</h2>
        <button className="btn btn-primary ml-auto !px-2.5 !py-1 text-xs" disabled={busy || !server?.cwd} onClick={() => send({ t: 'new_session' })}>
          <Plus size={14} /> {newLabel}
        </button>
      </div>
      <ul className="m-0 flex-1 list-none space-y-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && <li className="p-3 text-sm text-dim">{server?.cwd ? 'No takes yet. Say something in the booth.' : 'Pick a project to see its takes.'}</li>}
        {sessions.map((s) => {
          const active = s.sessionId === server?.sessionId;
          return (
            <li key={s.sessionId}>
              <button
                disabled={busy}
                onClick={() => send({ t: 'resume', sessionId: s.sessionId })}
                className={`w-full rounded-md border px-2.5 py-2 text-left transition disabled:opacity-60 ${active ? 'border-accent bg-accent/12' : 'border-transparent hover:border-line hover:bg-surface-hi/60'}`}
              >
                <div className="line-clamp-2 text-sm font-semibold leading-snug">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-dim">
                  <span>{timeAgo(s.lastModified)}</span>
                  {s.gitBranch && (
                    <span className="inline-flex items-center gap-0.5">
                      <GitBranch size={11} /> {s.gitBranch}
                    </span>
                  )}
                  {s.sessionId.startsWith('rehearsal-') && <span className="chip !py-0 !text-[0.62rem]">rehearsal</span>}
                  {s.source === 'claude' && <span className="chip !py-0 !text-[0.62rem]">from claude</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
