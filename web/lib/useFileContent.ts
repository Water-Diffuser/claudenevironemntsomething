// Fetches a project file's text from the backend, and re-fetches when the file changes on disk.
import { useEffect, useState } from 'react';
import { useScan } from '../state/scan';

export type FileStatus = 'idle' | 'loading' | 'ok' | 'missing' | 'binary';

export function useFileContent(path: string | null): { content: string | null; status: FileStatus; truncated: boolean } {
  const [state, setState] = useState<{ path: string | null; content: string | null; status: FileStatus; truncated: boolean }>({ path: null, content: null, status: 'idle', truncated: false });
  // The scan replaces a file's info object whenever the watcher sees it change, so this is our "file changed" signal.
  const info = useScan((s) => (path ? s.files.get(path) : undefined));
  const root = useScan((s) => s.root);

  useEffect(() => {
    if (!path) return void setState({ path: null, content: null, status: 'idle', truncated: false });
    let cancelled = false;
    // Show "loading" only when switching files (not on a refresh of the same file, to avoid flicker).
    setState((s) => (s.path === path ? s : { path, content: null, status: 'loading', truncated: false }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        if (cancelled) return;
        const data = (await res.json()) as { content?: string; truncated?: boolean; missing?: boolean; binary?: boolean; error?: string };
        if (data.binary) return setState({ path, content: null, status: 'binary', truncated: false });
        if (!res.ok || data.missing || data.content === undefined) return setState({ path, content: null, status: 'missing', truncated: false });
        setState({ path, content: data.content, status: 'ok', truncated: !!data.truncated });
      } catch {
        if (!cancelled) setState({ path, content: null, status: 'missing', truncated: false });
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [path, info, root]);

  return state.path === path ? state : { content: null, status: path ? 'loading' : 'idle', truncated: false };
}
