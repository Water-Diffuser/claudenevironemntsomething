// ============================================================================
//  ansi.ts: turn terminal output (with color codes like "\x1b[31m") into plain
//  pieces of text with a color, so the Terminal panel can show test results,
//  git status and build output in color. Colors are CSS variables, so they
//  follow the theme.
// ============================================================================

export interface AnsiSpan {
  text: string;
  /** A CSS color (a variable like "var(--c-bad)", or rgb(...)). Undefined = the normal text color. */
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

// The 8 normal and 8 bright terminal colors, mapped onto the theme's colors.
const BASIC = ['var(--c-text-dim)', 'var(--c-bad)', 'var(--c-good)', 'var(--c-warn)', 'var(--k-read)', 'var(--k-search)', 'var(--k-read)', 'var(--c-text)'];

/** Convert one block of terminal output to colored spans. */
export function parseAnsi(raw: string): AnsiSpan[] {
  // A "\r" means "go back to the start of the line" (progress bars): keep only what was written last.
  const text = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.slice(line.lastIndexOf('\r') + 1))
    .join('\n');

  const spans: AnsiSpan[] = [];
  let color: string | undefined;
  let bold = false;
  let dim = false;
  const push = (t: string) => t && spans.push({ text: t, color, bold, dim });

  const apply = (codes: number[]) => {
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) (color = undefined), (bold = false), (dim = false);
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) (bold = false), (dim = false);
      else if (c === 39) color = undefined;
      else if (c >= 30 && c <= 37) color = BASIC[c - 30];
      else if (c >= 90 && c <= 97) color = BASIC[c - 90];
      else if (c === 38 || c === 48) {
        // 38;5;n (256 colors) and 38;2;r;g;b (true color). We keep the foreground ones only.
        const mode = codes[i + 1];
        if (mode === 5) {
          if (c === 38 && codes[i + 2] < 16) color = BASIC[codes[i + 2] % 8];
          i += 2;
        } else if (mode === 2) {
          if (c === 38) color = `rgb(${codes[i + 2]} ${codes[i + 3]} ${codes[i + 4]})`;
          i += 4;
        }
      }
    }
  };

  // eslint-disable-next-line no-control-regex
  const seq = /\x1b\[([0-9;?]*)([A-Za-z])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = seq.exec(text))) {
    push(text.slice(last, m.index));
    if (m[2] === 'm') apply(m[1] === '' ? [0] : m[1].split(';').map((n) => parseInt(n, 10) || 0));
    last = seq.lastIndex; // any other escape sequence (cursor moves...) is simply dropped
  }
  push(text.slice(last));
  return spans;
}
