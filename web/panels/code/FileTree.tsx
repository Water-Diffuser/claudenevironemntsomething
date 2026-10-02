// ============================================================================
//  The file explorer: your project as a folder tree.
//    * click a file to open it in the editor (double-click keeps it open)
//    * a small colored dot marks files Claude has touched (the color code)
//    * a letter on the right shows git status (M modified, A added, U untracked...)
//    * type in the filter to search by name
//    * the + button makes a new file
// ============================================================================
import { ChevronRight, FilePlus, FileText, Folder, FolderOpen, PanelLeftClose, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GitChange } from '@shared/git';
import { kindVar } from '../../components/KindIcon';
import { baseName } from '../../lib/format';
import { rankPaths } from '../../lib/fuzzy';
import { openFile } from '../../lib/openFile';
import { useEditor } from '../../state/editor';
import { useGit } from '../../state/git';
import { useScan } from '../../state/scan';
import { useApp, useDerived } from '../../state/store';

interface Node {
  name: string;
  path: string;
  dir: boolean;
  children: Node[];
}

/** Turn a flat list of file paths into a folder tree (folders first, then files, each A to Z). */
function buildTree(paths: Iterable<string>): Node {
  const root: Node = { name: '', path: '', dir: true, children: [] };
  const dirs = new Map<string, Node>([['', root]]);
  for (const p of paths) {
    const parts = p.split('/');
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      const isDir = i < parts.length - 1;
      let node = isDir ? dirs.get(path) : undefined;
      if (!node) {
        node = { name: parts[i], path, dir: isDir, children: [] };
        parent.children.push(node);
        if (isDir) dirs.set(path, node);
      }
      parent = node;
    }
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

interface Row {
  node: Node;
  depth: number;
}

const GIT_LETTER: Record<GitChange['kind'], { letter: string; color: string }> = {
  modified: { letter: 'M', color: 'var(--c-warn)' },
  added: { letter: 'A', color: 'var(--c-good)' },
  deleted: { letter: 'D', color: 'var(--c-bad)' },
  renamed: { letter: 'R', color: 'var(--k-read)' },
  untracked: { letter: 'U', color: 'var(--c-good)' },
  conflict: { letter: '!', color: 'var(--c-bad)' },
};

export function FileTree({ onPick, onClose }: { onPick?: () => void; onClose?: () => void }) {
  const files = useScan((s) => s.files);
  const version = useScan((s) => s.layoutVersion);
  const d = useDerived();
  const git = useGit((s) => s.state);
  const tabs = useEditor((s) => s.tabs);
  const active = useEditor((s) => s.active);
  const dirty = useEditor((s) => s.dirty);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState('');
  const list = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(files.keys()), [files, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the folders that lead to the file you are in, so you can always see where it lives.
  useEffect(() => {
    if (!active) return;
    const parts = active.split('/').slice(0, -1);
    if (!parts.length) return;
    setOpen((o) => {
      const next = new Set(o);
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')));
      return next.size === o.size ? o : next;
    });
  }, [active]);

  // Folders that contain something Claude changed get a dot too.
  const changedDirs = useMemo(() => {
    const out = new Set<string>();
    for (const [p, t] of d.touched) {
      if (!(t.kinds.edit || t.kinds.create || t.kinds.delete)) continue;
      const parts = p.split('/').slice(0, -1);
      parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')));
    }
    return out;
  }, [d.count, d.touched]); // eslint-disable-line react-hooks/exhaustive-deps

  const gitByPath = useMemo(() => new Map((git?.changes ?? []).map((c) => [c.path, c])), [git]);

  // The rows to draw: a flat, ranked list while filtering, otherwise the open part of the tree.
  const rows = useMemo<Row[]>(() => {
    if (filter.trim()) {
      const hits = rankPaths(filter.trim(), files.keys(), new Set(tabs.map((t) => t.path)), 80);
      return hits.map((p) => ({ node: { name: p, path: p, dir: false, children: [] }, depth: 0 }));
    }
    const out: Row[] = [];
    const walk = (n: Node, depth: number) => {
      for (const c of n.children) {
        out.push({ node: c, depth });
        if (c.dir && open.has(c.path)) walk(c, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [filter, files, tabs, tree, open]);

  const toggle = (path: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const createFile = async () => {
    const path = newPath.trim().replace(/^\/+/, '');
    if (!path) return;
    try {
      const res = await fetch('/api/file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, content: '', createOnly: true }) });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) return useApp.getState().toast(body.error ?? 'Could not create the file.', 'error');
      setCreating(false);
      setNewPath('');
      openFile(path);
      onPick?.();
    } catch (err) {
      useApp.getState().toast(String((err as Error).message ?? err), 'error');
    }
  };

  // Arrow keys move through the rows; Left/Right fold and unfold folders.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && at >= 0) {
      const row = rows[at];
      if (row?.node.dir) {
        e.preventDefault();
        if (open.has(row.node.path) !== (e.key === 'ArrowRight')) toggle(row.node.path);
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="panel-head">
        <span className="panel-title">Files</span>
        <div className="ml-auto flex items-center">
          <button className="icon-btn icon-btn-sm" onClick={() => setCreating((c) => !c)} aria-label="New file" title="New file" aria-pressed={creating}>
            <FilePlus size={14} />
          </button>
          {onClose && (
            <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Hide the file list" title="Hide the file list">
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="shrink-0 border-b border-line p-2">
        <label className="relative block">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
          <input className="field !py-1 !pl-7 text-xs" placeholder="Filter files" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter files" />
        </label>
      </div>

      {creating && (
        <form
          className="shrink-0 border-b border-line p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createFile();
          }}
        >
          <input autoFocus className="field !py-1 text-xs" placeholder="src/new-file.ts, then Enter" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setCreating(false)} aria-label="Path of the new file" />
        </form>
      )}

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Project files" onKeyDown={onKeyDown}>
        {rows.length === 0 && <div className="px-3 py-4 text-xs text-dim">{filter ? 'No file matches.' : 'No files yet.'}</div>}
        {rows.map(({ node, depth }) => {
          const isOpen = open.has(node.path);
          const touched = d.touched.get(node.path);
          const change = gitByPath.get(node.path);
          const g = change ? GIT_LETTER[change.kind] : null;
          const selected = !node.dir && node.path === active;
          return (
            <button
              key={node.path}
              role="treeitem"
              aria-level={depth + 1}
              aria-expanded={node.dir ? isOpen : undefined}
              aria-selected={selected}
              title={node.path}
              className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-xs transition-colors hover:bg-surface-hi ${selected ? 'bg-surface-hi text-ink' : 'text-dim'}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => {
                if (node.dir) return toggle(node.path);
                openFile(node.path, { preview: true });
                onPick?.();
              }}
              onDoubleClick={() => !node.dir && openFile(node.path, { preview: false })}
            >
              {node.dir ? <ChevronRight size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} /> : <span className="w-3 shrink-0" />}
              {node.dir ? isOpen ? <FolderOpen size={13} className="shrink-0" /> : <Folder size={13} className="shrink-0" /> : <FileText size={13} className="shrink-0" />}
              <span className={`min-w-0 flex-1 truncate ${selected ? 'text-ink' : node.dir ? 'text-ink/90' : ''}`}>{filter && !node.dir ? baseName(node.path) : node.name}</span>
              {filter && !node.dir && node.path.includes('/') && <span className="min-w-0 max-w-[40%] shrink truncate text-[0.85em] opacity-60">{node.path.slice(0, node.path.lastIndexOf('/'))}</span>}
              {dirty[node.path] && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Unsaved changes" />}
              {touched && !node.dir && <span className="size-1.5 shrink-0 rounded-full" style={{ background: kindVar(touched.kind) }} title={`Claude: ${touched.kind}`} />}
              {node.dir && changedDirs.has(node.path) && <span className="size-1.5 shrink-0 rounded-full bg-k-edit opacity-70" title="Contains something Claude changed" />}
              {g && (
                <span className="w-3 shrink-0 text-center font-semibold" style={{ color: g.color }} title={change!.kind}>
                  {g.letter}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
