// Pick the folder Claude works in. The browser can't see your disk directly,
// so we ask the local server to list folders for us.
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Folder, FolderGit2, FolderOpen, Home, X } from 'lucide-react';
import type { FsListing } from '@shared/protocol';
import { dur } from '../theme/motion';
import { send, useApp } from '../state/store';
import { useLabel } from '../state/settings';
import { useUI } from '../state/ui';

export function ProjectPicker() {
  const open = useUI((s) => s.pickerOpen);
  const setOpen = useUI((s) => s.openPicker);
  const server = useApp((s) => s.server);
  const label = useLabel('project');
  const [listing, setListing] = useState<FsListing | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  const go = useCallback(
    async (p?: string, showHidden = hidden) => {
      try {
        const res = await fetch(`/api/fs/list?path=${encodeURIComponent(p ?? '')}${showHidden ? '&hidden=1' : ''}`);
        const data = (await res.json()) as FsListing;
        setListing(data);
        setPathInput(data.path);
        setError('');
      } catch {
        setError('Could not read that folder.');
      }
    },
    [hidden],
  );

  useEffect(() => {
    if (open) void go(server?.cwd ?? undefined);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const choose = (p: string) => {
    send({ t: 'set_project', cwd: p });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'color-mix(in srgb, var(--c-shade) 60%, transparent)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: dur(0.15) }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Choose a ${label}`}
            className="gloss flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: dur(0.22) }}
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <FolderOpen className="text-accent" size={20} />
              <h2 className="m-0 font-display text-xl text-accent-2">
                Choose a {label} <span className="font-sans text-sm text-dim">(project folder)</span>
              </h2>
              <button className="btn btn-ghost ml-auto !p-1.5" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {server && server.recentProjects.length > 0 && (
              <div className="border-b border-line px-4 py-2">
                <div className="mb-1 text-[0.68rem] uppercase tracking-wider text-dim">Recent</div>
                <div className="flex flex-wrap gap-1.5">
                  {server.recentProjects.map((p) => (
                    <button key={p} className="chip hover:border-accent hover:text-ink" onClick={() => choose(p)} title={p}>
                      <FolderGit2 size={12} /> {p.split('/').filter(Boolean).pop()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              className="flex gap-2 border-b border-line px-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void go(pathInput);
              }}
            >
              <button type="button" className="btn !p-2" title="Home folder" onClick={() => go(listing?.home)}>
                <Home size={16} />
              </button>
              <button type="button" className="btn !p-2" title="Up one folder" disabled={!listing?.parent} onClick={() => go(listing?.parent ?? undefined)}>
                <ArrowUp size={16} />
              </button>
              <input className="field font-mono text-sm" value={pathInput} onChange={(e) => setPathInput(e.target.value)} aria-label="Folder path" spellCheck={false} />
            </form>

            <div className="min-h-[12rem] flex-1 overflow-y-auto px-2 py-2">
              {error && <div className="p-3 text-bad">{error}</div>}
              {listing?.entries.length === 0 && <div className="p-3 text-dim">No sub-folders here.</div>}
              {listing?.entries.map((e) => (
                <button key={e.path} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-accent/10" onClick={() => go(e.path)} onDoubleClick={() => choose(e.path)}>
                  {e.hasGit ? <FolderGit2 size={16} className="text-accent" /> : <Folder size={16} className={e.isProject ? 'text-accent-2' : 'text-dim'} />}
                  <span className="truncate">{e.name}</span>
                  {e.isProject && <span className="chip ml-auto !py-0">project</span>}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <label className="flex items-center gap-1.5 text-sm text-dim">
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={(e) => {
                    setHidden(e.target.checked);
                    void go(listing?.path, e.target.checked);
                  }}
                />
                show hidden
              </label>
              <button className="btn btn-primary ml-auto" disabled={!listing} onClick={() => listing && choose(listing.path)}>
                <FolderOpen size={16} /> Open this folder
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
