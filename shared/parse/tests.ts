// ============================================================================
//  tests.ts: turn the text a test runner printed into a list of test results.
//  Handles Vitest, Jest, pytest, Go, cargo, and Node's built-in runner (TAP).
//  Test output is messy, so this is "best effort": if it can't tell, it returns null.
// ============================================================================
import { parseStack, type StackFrame } from './stack.ts';

export interface TestError {
  message: string;
  /** Raw stack lines. */
  stack: string[];
  frames: StackFrame[];
}

export interface TestCase {
  id: string;
  name: string;
  suite?: string;
  file?: string;
  status: 'pass' | 'fail' | 'skip' | 'running';
  ms?: number;
  error?: TestError;
}

export interface TestRun {
  runner: string;
  cases: TestCase[];
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs?: number;
}

/** Does this shell command run tests? */
export function isTestCommand(cmd: string): boolean {
  return /\b(vitest|jest|mocha|pytest|py\.test|unittest|nosetests|ava|tap|rspec|phpunit)\b|\b(npm|yarn|pnpm|bun)\s+(run\s+)?(test|t)\b|\bgo\s+test\b|\bcargo\s+(test|nextest)\b|\bnode\s+--test\b|\bdeno\s+test\b|\bmvn\s+test\b|\bgradle\w*\s+test\b/.test(cmd);
}

const MARK = /^(\s*)([✓✔√✕✗×✘↓○●❯►]|[-+]\s)\s*(.+?)\s*$/;
const PASS_MARKS = new Set(['✓', '✔', '√']);
const FAIL_MARKS = new Set(['✕', '✗', '×', '✘']);
const SKIP_MARKS = new Set(['↓', '○']);

/** Strip colors and carriage returns that terminals add. */
function clean(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
}

function trailingMs(name: string): { name: string; ms?: number } {
  const m = /^(.*?)\s*\(?(\d+(?:\.\d+)?)\s*ms\)?\s*$/.exec(name);
  return m ? { name: m[1].trim(), ms: parseFloat(m[2]) } : { name };
}

export function parseTests(rawOutput: string, cwd: string): TestRun | null {
  const text = clean(rawOutput);
  const lines = text.split('\n');
  const cases: TestCase[] = [];
  let runner = '';
  let durationMs: number | undefined;
  let nextId = 0;
  const add = (c: Omit<TestCase, 'id'>) => cases.push({ ...c, id: `t${nextId++}` });

  // ---- 1. pytest ------------------------------------------------------------------------
  const pytestRe = /^(\S+\.py)::(\S.*?)\s+(PASSED|FAILED|SKIPPED|XFAIL|XPASS|ERROR)\b/;
  // ---- 2. go test / cargo / TAP ------------------------------------------------------------
  const goRe = /^\s*--- (PASS|FAIL|SKIP): (\S+) \((\d+(?:\.\d+)?)s\)/;
  const cargoRe = /^test (\S+) \.\.\. (ok|FAILED|ignored)/;
  const tapRe = /^\s*(ok|not ok)\s+\d+\s+-?\s*(.*?)(?:\s+#\s*(SKIP|skip).*)?$/;
  // ---- 3. checkmark style (vitest / jest / node:test) -------------------------------------------
  let currentFile: string | undefined;
  const suiteStack: Array<{ indent: number; name: string }> = [];

  for (const line of lines) {
    let m: RegExpExecArray | null;

    if ((m = pytestRe.exec(line))) {
      runner ||= 'pytest';
      add({ name: m[2], file: m[1], status: m[3] === 'PASSED' || m[3] === 'XPASS' ? 'pass' : m[3] === 'SKIPPED' || m[3] === 'XFAIL' ? 'skip' : 'fail' });
      continue;
    }
    if ((m = goRe.exec(line))) {
      runner ||= 'go test';
      add({ name: m[2], status: m[1] === 'PASS' ? 'pass' : m[1] === 'SKIP' ? 'skip' : 'fail', ms: parseFloat(m[3]) * 1000 });
      continue;
    }
    if ((m = cargoRe.exec(line))) {
      runner ||= 'cargo test';
      add({ name: m[1], status: m[2] === 'ok' ? 'pass' : m[2] === 'ignored' ? 'skip' : 'fail' });
      continue;
    }
    if ((m = tapRe.exec(line)) && /^\s*(not )?ok\s+\d/.test(line)) {
      runner ||= 'tap';
      add({ name: m[2] || `test ${cases.length + 1}`, status: m[3] ? 'skip' : m[1] === 'ok' ? 'pass' : 'fail' });
      continue;
    }

    // Jest "PASS path" / "FAIL path" header
    if ((m = /^\s*(PASS|FAIL)\s+(\S+\.[a-z]+)\s*$/.exec(line))) {
      runner ||= 'jest';
      currentFile = m[2];
      suiteStack.length = 0;
      continue;
    }

    if ((m = MARK.exec(line))) {
      const indent = m[1].length;
      const mark = m[2].trim();
      const status: TestCase['status'] | null = PASS_MARKS.has(mark) ? 'pass' : FAIL_MARKS.has(mark) ? 'fail' : SKIP_MARKS.has(mark) ? 'skip' : null;
      const fileHeader = /^(\S+\.[a-zA-Z]+)\s+\((\d+) tests?(?:\s*\|[^)]*)?\)/.exec(m[3]);
      if (fileHeader && (status || mark === '❯')) {
        // Vitest file summary line: " ✓ src/a.test.ts (3 tests) 12ms" (a header, not a test)
        runner ||= 'vitest';
        currentFile = fileHeader[1];
        suiteStack.length = 0;
        continue;
      }
      if (status) {
        runner ||= currentFile ? 'vitest' : 'node:test';
        const { name, ms } = trailingMs(m[3]);
        // the nearest less-indented plain line is the suite
        while (suiteStack.length && suiteStack[suiteStack.length - 1].indent >= indent) suiteStack.pop();
        add({ name, ms, status, file: currentFile, suite: suiteStack.map((s) => s.name).join(' › ') || undefined });
        continue;
      }
    }

    // An unmarked indented line right after a file header may be a suite name (jest "describe").
    if (currentFile && /^\s{2,}\S/.test(line) && !/[:→❯]/.test(line) && !MARK.test(line) && line.trim().length < 80) {
      const indent = line.search(/\S/);
      while (suiteStack.length && suiteStack[suiteStack.length - 1].indent >= indent) suiteStack.pop();
      suiteStack.push({ indent, name: line.trim() });
    }
  }

  // ---- summary lines (also the only source when output is just dots) -------------------------
  let sum: { passed?: number; failed?: number; skipped?: number; total?: number } = {};
  let sm: RegExpExecArray | null;
  if ((sm = /Tests\s+(?:(\d+) failed\s*\|?\s*)?(?:(\d+) passed\s*\|?\s*)?(?:(\d+) skipped\s*\|?\s*)?(?:\((\d+)\))?/.exec(text)) && (sm[1] || sm[2] || sm[3])) {
    sum = { failed: +(sm[1] ?? 0), passed: +(sm[2] ?? 0), skipped: +(sm[3] ?? 0), total: sm[4] ? +sm[4] : undefined };
    runner ||= 'vitest';
  } else if ((sm = /Tests:\s+(?:(\d+) failed,\s*)?(?:(\d+) skipped,\s*)?(?:(\d+) passed,\s*)?(\d+) total/.exec(text))) {
    sum = { failed: +(sm[1] ?? 0), skipped: +(sm[2] ?? 0), passed: +(sm[3] ?? 0), total: +sm[4] };
    runner ||= 'jest';
  } else if ((sm = /=+\s*(?:(\d+) failed,?\s*)?(?:(\d+) passed,?\s*)?(?:(\d+) skipped,?\s*)?(?:(\d+) (?:errors?|warnings?),?\s*)?.*?in\s+([\d.]+)s/.exec(text)) && (sm[1] || sm[2])) {
    sum = { failed: +(sm[1] ?? 0), passed: +(sm[2] ?? 0), skipped: +(sm[3] ?? 0) };
    durationMs = parseFloat(sm[5]) * 1000;
    runner ||= 'pytest';
  } else if ((sm = /test result: (?:ok|FAILED)\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored/.exec(text))) {
    sum = { passed: +sm[1], failed: +sm[2], skipped: +sm[3] };
    runner ||= 'cargo test';
  }
  if (!durationMs) {
    const dm = /Duration\s+([\d.]+)(ms|s)\b|Time:\s+([\d.]+)\s*s\b|Ran \d+ tests? in ([\d.]+)s|(?:^|\n)ok\s+\S+\s+([\d.]+)s/.exec(text);
    if (dm) durationMs = dm[1] ? parseFloat(dm[1]) * (dm[2] === 's' ? 1000 : 1) : parseFloat(dm[3] ?? dm[4] ?? dm[5]) * 1000;
  }

  // No individual lines (dots/silent reporters)? Make anonymous cells from the summary so the grid still shows.
  const counted = cases.length;
  if (counted === 0 && (sum.passed || sum.failed || sum.skipped)) {
    for (let i = 0; i < (sum.passed ?? 0); i++) add({ name: `test ${i + 1}`, status: 'pass' });
    for (let i = 0; i < (sum.failed ?? 0); i++) add({ name: `failing test ${i + 1}`, status: 'fail' });
    for (let i = 0; i < (sum.skipped ?? 0); i++) add({ name: `skipped test ${i + 1}`, status: 'skip' });
  }
  if (cases.length === 0) return null;

  attachErrors(cases, text, cwd);

  const passed = cases.filter((c) => c.status === 'pass').length;
  const failed = cases.filter((c) => c.status === 'fail').length;
  const skipped = cases.filter((c) => c.status === 'skip').length;
  return { runner: runner || 'tests', cases, passed, failed, skipped, total: cases.length, durationMs };
}

/** Find the error message + stack printed for each failing test and attach it. */
function attachErrors(cases: TestCase[], text: string, cwd: string) {
  const failing = cases.filter((c) => c.status === 'fail');
  if (failing.length === 0) return;
  const lines = text.split('\n');

  // Headers that start a failure block: Jest "  ● Suite › name", Vitest " FAIL  file > suite > name", pytest "____ name ____", go "--- FAIL: name"
  const headerOf = (l: string): string | null => {
    let m: RegExpExecArray | null;
    if ((m = /^\s*●\s+(.+?)\s*$/.exec(l))) return m[1];
    if ((m = /^\s*FAIL\s+(\S.*?)\s*$/.exec(l)) && /[>›]/.test(m[1])) return m[1];
    if ((m = /^_{3,}\s+(.+?)\s+_{3,}$/.exec(l))) return m[1];
    if ((m = /^\s*--- FAIL: (\S+)/.exec(l))) return m[1];
    if ((m = /^---- (\S+) stdout ----$/.exec(l))) return m[1];
    return null;
  };

  const blocks: Array<{ title: string; body: string[] }> = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const l of lines) {
    const h = headerOf(l);
    if (h) {
      cur = { title: h, body: [] };
      blocks.push(cur);
    } else if (cur) {
      // blocks end at a summary line
      if (/^\s*(Test Files|Tests|Test Suites|Snapshots|Time|Duration|=+ .*(passed|failed).* =+|FAILED |short test summary)/.test(l)) cur = null;
      else cur.body.push(l);
    }
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const c of failing) {
    const want = norm(c.name);
    const block = blocks.find((b) => {
      const t = norm(b.title);
      return t === want || t.endsWith(want) || want.endsWith(t) || t.includes(want);
    });
    if (!block) continue;
    const body = block.body.filter((l) => l.trim() !== '' || false);
    const messageLines = body.filter((l) => !/^\s*(at\s|[❯›]\s|File "|\S+\.\w+:\d+)/.test(l) && !/^\s*[\d|>^~]+\s*[|]/.test(l)).slice(0, 4);
    const message = messageLines.map((l) => l.replace(/^\s*[E>]\s{0,3}/, '').trim()).filter(Boolean).join(' ') || 'failed';
    const stack = body.slice(0, 40);
    c.error = { message: message.slice(0, 400), stack, frames: parseStack(block.body.join('\n'), cwd) };
  }
}
