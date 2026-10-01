// ============================================================================
//  stack.ts: read a stack trace and pull out the "frames" (file, line, function).
//  Understands JavaScript/Node, Python, Go, and Rust. Pure functions, no imports.
// ============================================================================

export interface StackFrame {
  /** The original text of the line. */
  raw: string;
  /** Project-relative path when the file is inside the project, otherwise as printed. */
  file: string;
  line: number;
  col?: number;
  /** Function name, when the trace says one. */
  fn?: string;
  /** True for frames outside your project (node_modules, node internals, the standard library). */
  external: boolean;
}

/** Make a printed path project-relative, and say whether it belongs to the project. */
export function normalizePath(p: string, cwd: string): { file: string; external: boolean } {
  let file = p.trim().replace(/^file:\/\//, '').replace(/^webpack-internal:\/\/\/(\.\/)?/, '');
  file = file.replace(/\\/g, '/');
  const root = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  if (root && file.startsWith(root + '/')) file = file.slice(root.length + 1);
  file = file.replace(/^\.\//, '');
  const external = /(^|\/)node_modules\//.test(file) || file.startsWith('node:') || /^\/(usr|opt|lib|System|Library)\//.test(file) || /site-packages|dist-packages|\/rustc\/|\/go\/src\//.test(file) || file.startsWith('<');
  return { file, external };
}

const JS_AT = /^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
const VITEST = /^\s*[❯›]\s+(?:(\S+)\s+)?(\S+?\.[a-zA-Z]+):(\d+)(?::(\d+))?\s*$/;
const PY_FILE = /^\s*File "(.+?)", line (\d+)(?:, in (.+))?\s*$/;
const GO_LINE = /^\s*(?:.*?\s)?(\S+\.go):(\d+)(?:\s|$)/;
const RUST_AT = /^\s*(?:at\s+)?(\S+\.rs):(\d+)(?::(\d+))?\s*$/;
const PYTEST_LOC = /^(\S+\.py):(\d+):\s/;

/** Parse every frame found in `text`. Frame 0 is where it blew up; later frames are the callers. */
export function parseStack(text: string, cwd: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const lines = text.split('\n');
  let pythonStyle = false;
  for (const raw of lines) {
    let m: RegExpExecArray | null;
    let file = '';
    let line = 0;
    let col: number | undefined;
    let fn: string | undefined;
    if ((m = PY_FILE.exec(raw))) {
      pythonStyle = true;
      [file, line, fn] = [m[1], +m[2], m[3]];
    } else if ((m = JS_AT.exec(raw))) {
      [fn, file, line, col] = [m[1], m[2], +m[3], +m[4]];
    } else if ((m = VITEST.exec(raw))) {
      [fn, file, line, col] = [m[1], m[2], +m[3], m[4] ? +m[4] : undefined];
    } else if ((m = RUST_AT.exec(raw))) {
      [file, line, col] = [m[1], +m[2], m[3] ? +m[3] : undefined];
    } else if ((m = PYTEST_LOC.exec(raw))) {
      [file, line] = [m[1], +m[2]];
    } else if ((m = GO_LINE.exec(raw)) && /\.go:\d+/.test(raw)) {
      [file, line] = [m[1], +m[2]];
    } else continue;
    if (!file || !Number.isFinite(line)) continue;
    const { file: f, external } = normalizePath(file, cwd);
    frames.push({ raw: raw.trim(), file: f, line, col, fn: fn?.trim() || undefined, external });
  }
  // Python prints the OLDEST call first; flip it so frame 0 is always the failure point.
  return pythonStyle ? frames.reverse() : frames;
}
