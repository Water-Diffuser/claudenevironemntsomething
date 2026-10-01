// What the server tells the browser about the project's git repository.

export interface GitCommit {
  sha: string;
  parents: string[];
  author: string;
  /** Seconds since epoch. */
  ts: number;
  /** Branch / tag names pointing at this commit, e.g. "HEAD -> main", "origin/main", "tag: v1". */
  refs: string[];
  message: string;
  /** A pretend commit made by the Rehearsal (never written to your repo). */
  virtual?: boolean;
}

export interface GitChange {
  path: string;
  kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict';
  /** True if the change is staged (already `git add`ed). */
  staged: boolean;
  add?: number;
  del?: number;
}

export interface GitState {
  root: string;
  isRepo: boolean;
  branch: string | null;
  head: string | null;
  ahead: number;
  behind: number;
  /** Newest first, in topological order (so the graph can be drawn in lanes). */
  commits: GitCommit[];
  /** Files changed in the working tree right now. */
  changes: GitChange[];
  updatedAt: number;
}
