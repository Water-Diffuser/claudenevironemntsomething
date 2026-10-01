// ============================================================================
//  toolInfo.ts: understand a Claude tool call.
//  Given a tool name + input, work out WHAT it does in color-code terms
//  (read / search / edit / ...), WHICH files it touches, and a one-line summary.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@config';
import type { Kind } from '@shared/events';

/** Turn an absolute path into a project-relative one (forward slashes). Paths outside the project stay absolute. */
export function relPath(cwd: string, p: string): string {
  if (!p) return p;
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
  const rel = path.relative(cwd, abs);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs.split(path.sep).join('/');
  return rel.split(path.sep).join('/');
}

export interface ToolDescription {
  kind: Kind;
  paths: string[];
  summary: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Split a shell command into words, respecting simple quotes. */
function shellWords(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Find files a shell command deletes (best effort: handles `rm`, `git rm`, `unlink`). */
function deletedPaths(command: string): string[] {
  const found: string[] = [];
  // A command can chain several steps: "cd x && rm -rf y". Look at each step.
  for (const step of command.split(/&&|\|\||;|\n/)) {
    const words = shellWords(step.trim());
    let i = words[0] === 'sudo' ? 1 : 0;
    const cmd = words[i];
    if (cmd === 'git' && words[i + 1] === 'rm') i += 1;
    else if (cmd !== 'rm' && cmd !== 'unlink') continue;
    for (const w of words.slice(i + 1)) if (!w.startsWith('-')) found.push(w);
  }
  return found;
}

export function describeTool(tool: string, input: Record<string, unknown>, cwd: string): ToolDescription {
  const rel = (p: unknown) => relPath(cwd, str(p));
  let kind: Kind = config.toolKinds[tool] ?? 'other';

  switch (tool) {
    case 'Read': {
      const p = rel(input.file_path);
      const range = input.offset || input.limit ? ` (lines ${input.offset ?? 1}+${input.limit ? ' ×' + input.limit : ''})` : '';
      return { kind, paths: [p], summary: p + range };
    }
    case 'NotebookRead':
    case 'NotebookEdit': {
      const p = rel(input.notebook_path);
      return { kind, paths: [p], summary: p };
    }
    case 'LS': {
      const p = rel(input.path);
      return { kind, paths: [p], summary: p };
    }
    case 'Edit':
    case 'MultiEdit': {
      const p = rel(input.file_path);
      return { kind, paths: [p], summary: p };
    }
    case 'Write': {
      const p = rel(input.file_path);
      // New file = CREATED. Existing file = EDITED. (Checked before the write happens.)
      const exists = fs.existsSync(path.resolve(cwd, str(input.file_path)));
      kind = exists ? 'edit' : 'create';
      return { kind, paths: [p], summary: p };
    }
    case 'Glob':
      return { kind, paths: [], summary: `${str(input.pattern)}${input.path ? ' in ' + rel(input.path) : ''}` };
    case 'Grep': {
      const where = input.path ? rel(input.path) : '';
      return { kind, paths: where ? [where] : [], summary: `/${str(input.pattern)}/${where ? ' in ' + where : ''}` };
    }
    case 'WebFetch':
      return { kind, paths: [], summary: str(input.url) };
    case 'WebSearch':
      return { kind, paths: [], summary: str(input.query) };
    case 'Bash': {
      const command = str(input.command);
      const del = deletedPaths(command);
      if (del.length) {
        return { kind: 'delete', paths: del.map((d) => relPath(cwd, d)), summary: command.split('\n')[0] };
      }
      return { kind: 'run', paths: [], summary: str(input.description) || command.split('\n')[0] };
    }
    case 'TodoWrite':
      return { kind: 'other', paths: [], summary: 'updating the menu' };
    case 'Task':
    case 'Agent':
      return { kind: 'other', paths: [], summary: str(input.description) || 'sub-agent' };
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string') as string | undefined;
      return { kind, paths: [], summary: (first ?? '').slice(0, 100) };
    }
  }
}

/** Shorten very long strings inside a tool input so logs stay small. */
export function trimInput(input: Record<string, unknown>, maxChars = config.limits.maxInputStringChars): Record<string, unknown> {
  const trim = (v: unknown): unknown => {
    if (typeof v === 'string') return v.length > maxChars ? v.slice(0, maxChars) + `\n…[+${v.length - maxChars} more characters]` : v;
    if (Array.isArray(v)) return v.map(trim);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]));
    return v;
  };
  return trim(input) as Record<string, unknown>;
}

export function trimText(s: string, maxChars = config.limits.maxToolOutputChars): string {
  return s.length > maxChars ? s.slice(0, maxChars) + `\n…[+${s.length - maxChars} more characters]` : s;
}

/** A tool result can be a plain string or a list of content blocks. Flatten to text. */
export function flattenResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : b && (b as { type?: string }).type === 'image' ? '[image]' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : String(content);
}

/** For Grep/Glob: pull the file paths out of the text they returned. */
export function pathsFromOutput(tool: string, output: string, cwd: string): string[] {
  if (tool !== 'Grep' && tool !== 'Glob') return [];
  const found = new Set<string>();
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('Found ') || line.startsWith('No ')) continue;
    // "src/a.ts:12:some text" (Grep with line numbers) -> src/a.ts
    const m = /^(.+?):\d+[:-]/.exec(line);
    const candidate = m ? m[1] : line;
    // Only accept things that look like file paths.
    if (/\s/.test(candidate) && !fs.existsSync(path.resolve(cwd, candidate))) continue;
    if (!/[./\\]/.test(candidate)) continue;
    found.add(relPath(cwd, candidate));
    if (found.size >= 200) break;
  }
  return [...found];
}
