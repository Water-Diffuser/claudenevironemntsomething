// ============================================================================
//  buffers.ts: the text of every file open in the editor.
//
//  For each file we keep:
//    saved   what is on disk (as of the last time we looked)
//    text    what is in the editor right now (may have your unsaved edits)
//    mtime   the file's modification time, sent back when saving so the server can
//            refuse if something else changed the file in between ("conflict")
//  A file is "dirty" when text !== saved.
// ============================================================================
import { create } from 'zustand';
import { useEditor } from './editor';

export interface Buffer {
  path: string;
  status: 'loading' | 'ok' | 'missing' | 'binary';
  saved: string;
  text: string;
  mtime: number;
  truncated: boolean;
  /** The file changed on disk while you have unsaved edits. You must choose: reload, or keep yours. */
  changedOnDisk: boolean;
  /** A save is in progress. */
  saving: boolean;
}

interface FileReply {
  content?: string;
  truncated?: boolean;
  missing?: boolean;
  binary?: boolean;
  mtime?: number;
}

const blank = (path: string): Buffer => ({ path, status: 'loading', saved: '', text: '', mtime: 0, truncated: false, changedOnDisk: false, saving: false });

async function fetchFile(path: string): Promise<FileReply> {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    return (await res.json()) as FileReply;
  } catch {
    return { missing: true };
  }
}

interface BufferStore {
  buffers: Record<string, Buffer>;
  /** Read a file from disk into a buffer (does nothing if it is already loaded, unless `force`). */
  load: (path: string, force?: boolean) => Promise<void>;
  /** You typed in the editor. */
  edit: (path: string, text: string) => void;
  /** Write the buffer to disk. */
  save: (path: string) => Promise<{ ok: true } | { ok: false; conflict: boolean; error: string }>;
  /** The file may have changed on disk (the watcher noticed): quietly update, or flag a conflict if you have unsaved edits. */
  refresh: (path: string) => Promise<void>;
  /** Throw away your edits and take what is on disk. */
  reload: (path: string) => Promise<void>;
  /** Keep your edits, and let the next save overwrite what changed on disk. */
  keepMine: (path: string) => Promise<void>;
  forget: (path: string) => void;
}

export const useBuffers = create<BufferStore>((set, get) => {
  const patch = (path: string, p: Partial<Buffer>) => set((s) => (s.buffers[path] ? { buffers: { ...s.buffers, [path]: { ...s.buffers[path], ...p } } } : s));
  const syncDirty = (path: string) => {
    const b = get().buffers[path];
    if (b) useEditor.getState().setDirty(path, b.status === 'ok' && b.text !== b.saved);
  };

  return {
    buffers: {},

    async load(path, force = false) {
      const have = get().buffers[path];
      if (have && have.status !== 'loading' && !force) return;
      if (!have) set((s) => ({ buffers: { ...s.buffers, [path]: blank(path) } }));
      const r = await fetchFile(path);
      if (r.binary) return patch(path, { status: 'binary' });
      if (r.missing || r.content === undefined) return patch(path, { status: 'missing', saved: '', text: '' });
      patch(path, { status: 'ok', saved: r.content, text: r.content, mtime: r.mtime ?? 0, truncated: !!r.truncated, changedOnDisk: false });
      syncDirty(path);
    },

    edit(path, text) {
      patch(path, { text });
      useEditor.getState().makePermanent(path);
      syncDirty(path);
    },

    async save(path) {
      const b = get().buffers[path];
      if (!b || b.status !== 'ok') return { ok: false, conflict: false, error: 'Nothing to save.' };
      if (b.truncated) return { ok: false, conflict: false, error: 'This file is only partly loaded (it is very large), so saving would cut it. Edit it in another tool.' };
      const sending = b.text;
      patch(path, { saving: true });
      try {
        const res = await fetch('/api/file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, content: sending, baseMtime: b.mtime || undefined }) });
        const body = (await res.json()) as { ok?: boolean; mtime?: number; error?: string; code?: string };
        if (res.ok && body.ok) {
          // (if you kept typing while it saved, the buffer is still dirty, which is right)
          patch(path, { saving: false, saved: sending, mtime: body.mtime ?? b.mtime, changedOnDisk: false });
          syncDirty(path);
          return { ok: true };
        }
        patch(path, { saving: false, changedOnDisk: body.code === 'changed_on_disk' });
        return { ok: false, conflict: body.code === 'changed_on_disk', error: body.error ?? 'Could not save.' };
      } catch (err) {
        patch(path, { saving: false });
        return { ok: false, conflict: false, error: String((err as Error).message ?? err) };
      }
    },

    async refresh(path) {
      const b = get().buffers[path];
      if (!b || b.status === 'loading') return;
      const r = await fetchFile(path);
      const now = get().buffers[path];
      if (!now) return;
      if (r.binary || r.missing || r.content === undefined) {
        // deleted (or turned binary) on disk: if you have no edits, show that; otherwise keep your text so it is not lost
        if (now.text === now.saved) patch(path, { status: r.binary ? 'binary' : 'missing', saved: '', text: '' });
        else patch(path, { changedOnDisk: true });
        return syncDirty(path);
      }
      if (r.content === now.saved) return patch(path, { mtime: r.mtime ?? now.mtime }); // nothing new (e.g. our own save)
      if (now.text === now.saved) patch(path, { status: 'ok', saved: r.content, text: r.content, mtime: r.mtime ?? 0, truncated: !!r.truncated });
      else patch(path, { changedOnDisk: true });
      syncDirty(path);
    },

    async reload(path) {
      await get().load(path, true);
    },

    async keepMine(path) {
      const r = await fetchFile(path);
      // adopt the new disk version as the baseline, so only YOUR differences count as edits
      patch(path, { changedOnDisk: false, mtime: r.mtime ?? get().buffers[path]?.mtime ?? 0, saved: r.content ?? '' });
      syncDirty(path);
    },

    forget(path) {
      set((s) => {
        const { [path]: _gone, ...rest } = s.buffers;
        return { buffers: rest };
      });
    },
  };
});
