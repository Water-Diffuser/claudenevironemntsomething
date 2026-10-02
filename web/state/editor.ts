// ============================================================================
//  editor.ts: which files are open in the editor (the tab strip), and what is
//  selected in it. The editor's text itself lives in Monaco; this only keeps the
//  small facts other parts of the app need (the @-mention menu, the explorer).
// ============================================================================
import { create } from 'zustand';

export interface EditorTab {
  path: string;
  /** A "preview" tab (shown in italics) is replaced when you preview another file. Editing it makes it permanent. */
  preview: boolean;
}

interface EditorStore {
  tabs: EditorTab[];
  active: string | null;
  /** Files with edits that are not saved yet. */
  dirty: Record<string, true>;
  /** True = the editor jumps to whichever file Claude is in. Clicking a file yourself turns it off ("pinned"). */
  follow: boolean;
  setFollow: (follow: boolean) => void;
  /** The lines selected in the editor right now (for "@selection" in the message box). */
  selection: { path: string; startLine: number; endLine: number } | null;
  open: (path: string, opts?: { preview?: boolean }) => void;
  close: (path: string) => void;
  setActive: (path: string) => void;
  makePermanent: (path: string) => void;
  setDirty: (path: string, dirty: boolean) => void;
  setSelection: (sel: EditorStore['selection']) => void;
  /** Forget a file (it was deleted or does not exist any more). */
  drop: (path: string) => void;
}

export const useEditor = create<EditorStore>((set) => ({
  tabs: [],
  active: null,
  dirty: {},
  follow: true,
  setFollow: (follow) => set({ follow }),
  selection: null,

  open(path, opts = {}) {
    set((s) => {
      const have = s.tabs.find((t) => t.path === path);
      if (have) return { active: path, tabs: opts.preview === false ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)) : s.tabs };
      const preview = opts.preview ?? true;
      // a new preview replaces the old preview tab (as VS Code does), so tabs don't pile up as you browse
      const kept = preview ? s.tabs.filter((t) => !t.preview) : s.tabs;
      return { tabs: [...kept, { path, preview }], active: path };
    });
  },

  close(path) {
    set((s) => {
      const i = s.tabs.findIndex((t) => t.path === path);
      if (i < 0) return s;
      const tabs = s.tabs.filter((t) => t.path !== path);
      const { [path]: _gone, ...dirty } = s.dirty;
      const active = s.active === path ? (tabs[Math.min(i, tabs.length - 1)]?.path ?? null) : s.active;
      return { tabs, active, dirty };
    });
  },

  setActive: (active) => set({ active }),
  makePermanent: (path) => set((s) => ({ tabs: s.tabs.map((t) => (t.path === path && t.preview ? { ...t, preview: false } : t)) })),
  setDirty(path, isDirty) {
    set((s) => {
      if (!!s.dirty[path] === isDirty) return s;
      const dirty = { ...s.dirty };
      if (isDirty) dirty[path] = true;
      else delete dirty[path];
      return { dirty };
    });
  },
  setSelection: (selection) => set({ selection }),
  drop(path) {
    set((s) => {
      if (!s.tabs.some((t) => t.path === path)) return s;
      const tabs = s.tabs.filter((t) => t.path !== path);
      const { [path]: _gone, ...dirty } = s.dirty;
      return { tabs, dirty, active: s.active === path ? (tabs[tabs.length - 1]?.path ?? null) : s.active };
    });
  },
}));
