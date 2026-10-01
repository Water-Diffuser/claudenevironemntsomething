// ============================================================================
//  command.ts: summarize a shell command's output as a few colored "chips" and
//  a progress hint, instead of a wall of text. Recognizes npm/pnpm/yarn installs,
//  TypeScript, ESLint, Vite/webpack builds, pip, cargo, go, and git.
// ============================================================================
import { normalizePath } from './stack.ts';

export type Tone = 'good' | 'bad' | 'warn' | 'dim';

export interface Chip {
  label: string;
  tone: Tone;
}

/** One problem a command reported, pointing at a spot in the code. */
export interface CodeProblem {
  file: string;
  line: number;
  col?: number;
  message: string;
  code?: string;
  severity: 'error' | 'warning';
}

export interface CommandReport {
  family: 'install' | 'build' | 'lint' | 'typecheck' | 'test' | 'git' | 'other';
  /** A short human title, e.g. "Type check" or "Install packages". */
  title: string;
  chips: Chip[];
  /** 0..1 when the output tells us how far along it is. */
  percent?: number;
  /** The few most important lines (errors, or the final summary). */
  highlights: string[];
  problems: CodeProblem[];
}

const clean = (t: string) => t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '\n');

function familyOf(cmd: string): { family: CommandReport['family']; title: string } {
  if (/\b(tsc|mypy|pyright)\b/.test(cmd)) return { family: 'typecheck', title: 'Type check' };
  if (/\b(eslint|ruff|flake8|pylint|biome|prettier|stylelint|golangci-lint|clippy)\b/.test(cmd)) return { family: 'lint', title: 'Lint' };
  if (/\b(npm|yarn|pnpm|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bbundle install\b|\bpoetry (install|add)\b|\bcargo add\b|\bgo get\b/.test(cmd)) return { family: 'install', title: 'Install packages' };
  if (/\b(build|vite|webpack|rollup|esbuild|parcel|next|make|cmake|gcc|g\+\+)\b|\bcargo (build|check)\b|\bgo build\b/.test(cmd)) return { family: 'build', title: 'Build' };
  if (/^\s*git\b/.test(cmd)) return { family: 'git', title: 'Git' };
  return { family: 'other', title: 'Command' };
}

/** Pull "file(line,col): error TS1234: message" and "file:line:col: error: message" lines. */
function findProblems(text: string, cwd: string): CodeProblem[] {
  const out: CodeProblem[] = [];
  let eslintFile = '';
  for (const raw of text.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/.exec(raw))) {
      // TypeScript: src/a.ts(10,5): error TS2322: Type ...
      out.push({ file: normalizePath(m[1], cwd).file, line: +m[2], col: +m[3], severity: m[4] as 'error' | 'warning', code: m[5], message: m[6] });
    } else if ((m = /^(\S[^:\s][^:]*?):(\d+):(\d+):\s*(?:(error|warning|fatal error)\b:?\s*)?(.*)$/.exec(raw)) && /\.[a-zA-Z]+$/.test(m[1]) && (m[4] || /\berror\b|\bTS\d+/.test(m[5]))) {
      // gcc / ruff / mypy / go: file:line:col: error: message
      out.push({ file: normalizePath(m[1], cwd).file, line: +m[2], col: +m[3], severity: m[4] === 'warning' ? 'warning' : 'error', message: m[5] });
    } else if ((m = /^(\/\S+|\S+\.[a-z]+)\s*$/.exec(raw)) && /\.[a-z]+$/.test(raw.trim())) {
      eslintFile = raw.trim(); // ESLint "stylish" prints the file name on its own line
    } else if (eslintFile && (m = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.*?)(?:\s{2,}(\S+))?$/.exec(raw))) {
      out.push({ file: normalizePath(eslintFile, cwd).file, line: +m[1], col: +m[2], severity: m[3] as 'error' | 'warning', message: m[4], code: m[5] });
    } else if ((m = /^\s*(?:error(?:\[(\w+)\])?:.*)\n?/.exec(raw))) {
      /* rust: the location is on the next line (" --> src/main.rs:5:9"), handled below */
    }
    if ((m = /^\s*-->\s+(\S+?):(\d+):(\d+)/.exec(raw))) {
      out.push({ file: normalizePath(m[1], cwd).file, line: +m[2], col: +m[3], severity: 'error', message: 'compile error' });
    }
  }
  return out;
}

export function parseCommand(command: string, rawOutput: string, ok: boolean, cwd: string): CommandReport {
  const text = clean(rawOutput);
  const { family, title } = familyOf(command);
  const chips: Chip[] = [];
  const problems = findProblems(text, cwd);
  let percent: number | undefined;
  let m: RegExpExecArray | null;

  // ---- package installs ---------------------------------------------------------------------
  if ((m = /added (\d+) packages?/.exec(text))) chips.push({ label: `+${m[1]} packages`, tone: 'good' });
  if ((m = /removed (\d+) packages?/.exec(text))) chips.push({ label: `−${m[1]} packages`, tone: 'warn' });
  if ((m = /audited (\d+) packages? in ([\d.]+m?s)/.exec(text))) chips.push({ label: `audited ${m[1]} in ${m[2]}`, tone: 'dim' });
  if ((m = /found (\d+) vulnerabilit/.exec(text))) chips.push({ label: m[1] === '0' ? 'no vulnerabilities' : `${m[1]} vulnerabilities`, tone: m[1] === '0' ? 'good' : 'bad' });
  if ((m = /Successfully installed (.+)/.exec(text))) chips.push({ label: `installed ${m[1].split(/\s+/).length} packages`, tone: 'good' });
  if ((m = /Packages: \+(\d+)/.exec(text))) chips.push({ label: `+${m[1]} packages`, tone: 'good' });

  // ---- build tools ---------------------------------------------------------------------------
  if ((m = /built in ([\d.]+m?s)/.exec(text))) chips.push({ label: `built in ${m[1]}`, tone: 'good' });
  if ((m = /(\d+) modules? transformed/.exec(text))) chips.push({ label: `${m[1]} modules`, tone: 'dim' });
  if ((m = /Finished .*? in ([\d.]+s)/.exec(text))) chips.push({ label: `finished in ${m[1]}`, tone: 'good' });
  if ((m = /Compiled successfully|compiled successfully|Build succeeded/.exec(text))) chips.push({ label: 'compiled', tone: 'good' });
  const sizes = [...text.matchAll(/(\S+\.(?:js|css|html|wasm))\s+([\d.,]+ ?[kKmM]?[bB])/g)];
  if (sizes.length) chips.push({ label: `${sizes.length} files · largest ${sizes.map((s) => s[2]).sort().pop()}`, tone: 'dim' });

  // ---- type checkers and linters ------------------------------------------------------------------
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  if ((m = /Found (\d+) errors?/.exec(text))) chips.push({ label: `${m[1]} type errors`, tone: 'bad' });
  else if ((m = /[✖x]\s*(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/.exec(text))) {
    chips.push({ label: `${m[2]} errors`, tone: +m[2] ? 'bad' : 'good' }, { label: `${m[3]} warnings`, tone: +m[3] ? 'warn' : 'dim' });
  } else if (problems.length) {
    if (errors) chips.push({ label: `${errors} error${errors === 1 ? '' : 's'}`, tone: 'bad' });
    if (warnings) chips.push({ label: `${warnings} warning${warnings === 1 ? '' : 's'}`, tone: 'warn' });
  }
  if ((m = /All checks passed|no issues found|Success: no issues/i.exec(text))) chips.push({ label: 'clean', tone: 'good' });

  // ---- git ----------------------------------------------------------------------------------------
  if ((m = /\[([\w./-]+) ([0-9a-f]{7,})\] (.+)/.exec(text))) chips.push({ label: `commit ${m[2].slice(0, 7)}`, tone: 'good' });
  if ((m = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(text))) {
    chips.push({ label: `${m[1]} files`, tone: 'dim' });
    if (m[2]) chips.push({ label: `+${m[2]}`, tone: 'good' });
    if (m[3]) chips.push({ label: `−${m[3]}`, tone: 'bad' });
  }

  // ---- progress ------------------------------------------------------------------------------------
  const pct = [...text.matchAll(/(\d{1,3})%/g)].pop();
  const steps = [...text.matchAll(/\[(\d+)\/(\d+)\]/g)].pop();
  if (steps) percent = +steps[1] / Math.max(1, +steps[2]);
  else if (pct) percent = Math.min(1, +pct[1] / 100);

  // ---- generic fallbacks ------------------------------------------------------------------------------
  if (chips.length === 0) {
    const errLines = text.split('\n').filter((l) => /\berror\b|\bfailed\b|\bexception\b|\btraceback\b/i.test(l)).length;
    const warnLines = text.split('\n').filter((l) => /\bwarn(ing)?\b/i.test(l)).length;
    if (errLines) chips.push({ label: `${errLines} error line${errLines === 1 ? '' : 's'}`, tone: 'bad' });
    if (warnLines) chips.push({ label: `${warnLines} warning${warnLines === 1 ? '' : 's'}`, tone: 'warn' });
    const total = text.split('\n').filter((l) => l.trim()).length;
    if (total) chips.push({ label: `${total} line${total === 1 ? '' : 's'} of output`, tone: 'dim' });
  }

  // The most useful lines: problems first, otherwise the last meaningful line(s).
  const meaningful = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = meaningful.filter((l) => /\berror\b|\bfailed\b|✖|\bTS\d{4}\b/i.test(l)).slice(0, 3);
  const highlights = !ok || bad.length ? bad.slice(0, 3) : meaningful.slice(-2);
  void family;
  return { family, title, chips: chips.slice(0, 6), percent, highlights, problems: problems.slice(0, 200) };
}
