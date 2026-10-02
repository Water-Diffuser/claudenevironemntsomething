// ============================================================================
//  files.ts: reading, saving and undoing edits to files in the open project.
//
//  Everything here is about SAFETY first:
//    * a path must stay inside the project folder (no "../../etc/passwd", and no
//      sneaking out through a symlink)
//    * a save refuses if the file changed on disk since you opened it (so you
//      never silently overwrite what Claude or another tool just wrote)
//    * undoing an edit only happens if the file still looks exactly like it did
//      right after the edit
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

export class FileError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve a project-relative path to an absolute one, refusing anything outside the project. */
export function safeResolve(cwd: string, rel: string): string {
  if (!rel || rel.includes('\0')) throw new FileError(400, 'bad_path', 'Missing or invalid path.');
  const root = fs.realpathSync(cwd);
  const abs = path.resolve(root, rel);
  const inside = (p: string) => p === root || p.startsWith(root + path.sep);
  if (!inside(abs)) throw new FileError(403, 'outside_project', 'That path is outside the project.');
  // Follow symlinks: the nearest folder that really exists must also be inside the project.
  let probe = abs;
  while (!fs.existsSync(probe) && probe !== root) probe = path.dirname(probe);
  if (!inside(fs.realpathSync(probe))) throw new FileError(403, 'outside_project', 'That path leaves the project through a link.');
  // Never write inside .git (that would corrupt the repository).
  const parts = path.relative(root, abs).split(path.sep);
  if (parts[0] === '.git') throw new FileError(403, 'git_dir', 'Files inside .git are off limits.');
  return abs;
}

export interface SaveRequest {
  path: string;
  content: string;
  /** The file's modification time when you opened it. If it differs now, the save is refused (409). */
  baseMtime?: number;
  /** Refuse if the file already exists (used by "New file"). */
  createOnly?: boolean;
}

export function saveFile(cwd: string, req: SaveRequest): { mtime: number; size: number } {
  if (typeof req.content !== 'string') throw new FileError(400, 'bad_content', 'Nothing to save.');
  const abs = safeResolve(cwd, req.path);
  let existing: fs.Stats | null = null;
  try {
    existing = fs.statSync(abs);
  } catch {
    /* new file */
  }
  if (existing && !existing.isFile()) throw new FileError(400, 'not_a_file', 'That is not a file.');
  if (existing && req.createOnly) throw new FileError(409, 'exists', 'A file with that name already exists.');
  if (existing && req.baseMtime !== undefined && Math.abs(existing.mtimeMs - req.baseMtime) > 1) {
    throw new FileError(409, 'changed_on_disk', 'The file changed on disk after you opened it.');
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, req.content, 'utf8');
  const st = fs.statSync(abs);
  return { mtime: st.mtimeMs, size: st.size };
}

// ---- undoing an edit ----------------------------------------------------------

/** One hunk of a diff, exactly as the Edit tool reports it (see EditRecord in the browser). */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Each line starts with " " (unchanged), "-" (removed) or "+" (added). */
  lines: string[];
}

export interface RevertRequest {
  path: string;
  type: 'edit' | 'create';
  hunks: Hunk[];
}

const EOL = /\r?\n/;

/** Does `block` appear in `lines` starting at index `at`? */
const matchesAt = (lines: string[], block: string[], at: number) => at >= 0 && at + block.length <= lines.length && block.every((l, i) => lines[at + i] === l);

/** Find where `block` sits in `lines`: at the expected place if it is there, else the only place it occurs. */
function locate(lines: string[], block: string[], expected: number): number {
  if (matchesAt(lines, block, expected)) return expected;
  if (block.length === 0) return -1;
  let found = -1;
  for (let i = 0; i + block.length <= lines.length; i++) {
    if (matchesAt(lines, block, i)) {
      if (found >= 0) return -1; // it occurs twice: we cannot tell which one is the edit
      found = i;
    }
  }
  return found;
}

/**
 * Undo one edit: put the file back the way it was before. Returns what happened.
 *   created file  -> deleted (only if it still holds exactly what Claude wrote)
 *   edited file   -> each changed block goes back to its old lines (only if the new lines are still there)
 * If the file no longer matches, nothing is touched and a 409 explains why.
 */
export function revertEdit(cwd: string, req: RevertRequest): { action: 'deleted' | 'restored' } {
  const abs = safeResolve(cwd, req.path);
  if (!fs.existsSync(abs)) throw new FileError(409, 'not_applied', 'The file is not on disk, so there is nothing to undo.');
  const text = fs.readFileSync(abs, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(EOL);

  if (req.type === 'create') {
    const wrote = req.hunks.flatMap((h) => h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1)));
    const have = text.replace(/\r?\n$/, '').split(EOL);
    if (wrote.length === 0 || wrote.join('\n') !== have.join('\n')) throw new FileError(409, 'changed_since', 'The file no longer holds exactly what Claude wrote, so it was left alone.');
    fs.unlinkSync(abs);
    return { action: 'deleted' };
  }

  // Work from the bottom of the file upwards, so earlier line numbers stay valid.
  const hunks = [...req.hunks].sort((a, b) => b.newStart - a.newStart);
  for (const h of hunks) {
    const after = h.lines.filter((l) => l[0] === ' ' || l[0] === '+').map((l) => l.slice(1));
    const before = h.lines.filter((l) => l[0] === ' ' || l[0] === '-').map((l) => l.slice(1));
    const at = locate(lines, after, h.newStart - 1);
    if (at < 0) throw new FileError(409, 'not_applied', 'This change is not in the file any more (or it was edited again), so there is nothing to undo.');
    lines.splice(at, after.length, ...before);
  }
  fs.writeFileSync(abs, lines.join(eol), 'utf8');
  return { action: 'restored' };
}
