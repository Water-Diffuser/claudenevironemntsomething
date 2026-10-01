// ============================================================================
//  git.ts: the browser's copy of the repository state, plus which commits
//  Claude made this session (they get a glowing "new commit" node).
// ============================================================================
import { create } from 'zustand';
import type { GitState } from '@shared/git';

interface GitStore {
  state: GitState | null;
  /** Commits that appeared while Claude was working (or pretend rehearsal commits). */
  claudeShas: Set<string>;
  apply: (state: GitState | null, busy: boolean) => void;
}

export const useGit = create<GitStore>((set, get) => ({
  state: null,
  claudeShas: new Set(),
  apply(next, busy) {
    const prev = get().state;
    let claudeShas = get().claudeShas;
    if (!next || !prev || prev.root !== next.root) claudeShas = new Set();
    else {
      const known = new Set(prev.commits.map((c) => c.sha));
      const fresh = next.commits.filter((c) => !known.has(c.sha) && (busy || c.virtual));
      if (fresh.length) claudeShas = new Set([...claudeShas, ...fresh.map((c) => c.sha)]);
    }
    set({ state: next, claudeShas });
  },
}));
