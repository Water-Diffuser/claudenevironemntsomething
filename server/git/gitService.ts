// ============================================================================
//  gitService.ts: reads the project's git state with simple-git and keeps it fresh.
//  READ-ONLY: it only runs `git log`, `git status` and `git diff`. It never changes your repo.
//  (In Rehearsal mode a pretend commit can be added to the picture; that is never written to git.)
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { simpleGit } from 'simple-git';
import type { GitChange, GitCommit, GitState } from '../../shared/git.ts';
import type { ServerMsg } from '../../shared/protocol.ts';

const MAX_COMMITS = 150;

export class GitService {
  state: GitState | null = null;
  private root: string | null = null;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private virtual: GitCommit[] = [];
  private generation = 0;

  constructor(private broadcast: (msg: ServerMsg) => void) {}

  async open(root: string | null) {
    const gen = ++this.generation;
    await this.watcher?.close();
    this.watcher = null;
    this.root = root;
    this.virtual = [];
    this.state = null;
    if (!root) return this.broadcast({ t: 'git', state: null });
    await this.refresh();
    if (gen !== this.generation) return;
    // Watch the files git itself changes when you commit, switch branches, or stage things.
    const gitDir = path.join(root, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      this.watcher = chokidar.watch([path.join(gitDir, 'HEAD'), path.join(gitDir, 'index'), path.join(gitDir, 'refs'), path.join(gitDir, 'packed-refs')], {
        ignoreInitial: true,
        depth: 6,
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      });
      this.watcher.on('all', () => this.scheduleRefresh());
      this.watcher.on('error', () => {});
    }
  }

  /** Ask for a refresh soon (several requests in a row become one). */
  scheduleRefresh(ms = 350) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, ms);
  }

  /** Rehearsal only: show a pretend commit on top of the real history. */
  addVirtualCommit(message: string) {
    if (!this.state?.isRepo) return;
    const parent = this.virtual[0]?.sha ?? this.state.head;
    this.virtual.unshift({
      sha: `virtual-${Date.now().toString(36)}`,
      parents: parent ? [parent] : [],
      author: 'The Voice (rehearsal)',
      ts: Math.floor(Date.now() / 1000),
      refs: [`HEAD -> ${this.state.branch ?? 'main'}`],
      message,
      virtual: true,
    });
    void this.refresh();
  }

  async refresh() {
    const root = this.root;
    if (!root) return;
    const gen = this.generation;
    const next = await this.read(root);
    if (gen !== this.generation) return;
    this.state = next;
    this.broadcast({ t: 'git', state: next });
  }

  private async read(root: string): Promise<GitState> {
    const empty: GitState = { root, isRepo: false, branch: null, head: null, ahead: 0, behind: 0, commits: [], changes: [], updatedAt: Date.now() };
    // GIT_OPTIONAL_LOCKS=0 makes `git status` not touch the index, so reading can't trigger our own watcher.
    // We also drop variables inherited from your shell that simple-git refuses for safety (GIT_EDITOR, EDITOR, PAGER...),
    // and GIT_DIR & friends, which would point git at the wrong repo.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^GIT_|^(EDITOR|VISUAL|PAGER|ASKPASS|SSH_ASKPASS)$/.test(k)) env[k] = v;
    env.GIT_OPTIONAL_LOCKS = '0';
    const git = simpleGit({ baseDir: root, allowEnvironment: ['GIT_OPTIONAL_LOCKS'] }).env(env);
    try {
      if (!(await git.checkIsRepo())) return empty;
    } catch {
      return empty;
    }

    const state: GitState = { ...empty, isRepo: true };

    try {
      const st = await git.status();
      state.branch = st.current;
      state.ahead = st.ahead;
      state.behind = st.behind;
      const changes: GitChange[] = [];
      for (const f of st.files) {
        const idx = f.index.trim();
        const wd = f.working_dir.trim();
        const kind: GitChange['kind'] =
          idx === '?'
            ? 'untracked'
            : idx === 'U' || wd === 'U' || (idx === 'A' && wd === 'A') || (idx === 'D' && wd === 'D')
              ? 'conflict'
              : idx === 'A' || wd === 'A'
                ? 'added'
                : idx === 'D' || wd === 'D'
                  ? 'deleted'
                  : idx === 'R' || wd === 'R'
                    ? 'renamed'
                    : 'modified';
        changes.push({ path: f.path, kind, staged: idx !== '' && idx !== '?' });
      }
      // how many lines each changed file has added/removed
      try {
        const numstat = await git.raw(['diff', '--numstat', 'HEAD']);
        const stats = new Map<string, { add: number; del: number }>();
        for (const line of numstat.split('\n')) {
          const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
          if (m) stats.set(m[3], { add: m[1] === '-' ? 0 : +m[1], del: m[2] === '-' ? 0 : +m[2] });
        }
        for (const c of changes) {
          const s = stats.get(c.path);
          if (s) (c.add = s.add), (c.del = s.del);
        }
      } catch {
        /* no commits yet: no numbers */
      }
      state.changes = changes.slice(0, 400);
    } catch {
      /* unreadable status: show what we can */
    }

    try {
      state.head = (await git.raw(['rev-parse', 'HEAD'])).trim() || null;
    } catch {
      state.head = null; // a brand-new repo with no commits
    }

    try {
      const log = await git.raw(['log', '--all', '--topo-order', '-n', String(MAX_COMMITS), '--pretty=format:%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s%x1e']);
      const commits: GitCommit[] = [];
      for (const rec of log.split('\x1e')) {
        const f = rec.replace(/^\n/, '').split('\x1f');
        if (f.length < 6 || !f[0]) continue;
        commits.push({ sha: f[0], parents: f[1] ? f[1].split(' ') : [], author: f[2], ts: +f[3], refs: f[4] ? f[4].split(', ').filter(Boolean) : [], message: f[5] });
      }
      state.commits = commits;
    } catch {
      state.commits = [];
    }

    // Pretend commits (Rehearsal) sit on top, and take over the "HEAD" label.
    if (this.virtual.length) {
      state.commits = [...this.virtual, ...state.commits.map((c) => (c.sha === state.head ? { ...c, refs: c.refs.map((r) => r.replace(/^HEAD -> /, '')) } : c))];
      state.head = this.virtual[0].sha;
    }
    return state;
  }

  async close() {
    this.generation++;
    await this.watcher?.close();
    this.watcher = null;
  }
}
