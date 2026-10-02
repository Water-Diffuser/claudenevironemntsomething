// ============================================================================
//  draw.ts: paints the Cut Diagram onto a <canvas>.
//
//  The look is inspired by a butcher's cut chart: folders are bold-outlined
//  "primal cuts" with a label tag, files are the smaller cuts inside them.
//  When Claude touches a file its cell lights up in the color code, then fades
//  to a faint "recently touched" glow.
// ============================================================================
import type { FileInfo } from '@shared/scan';
import { glowIntensity, nextRedrawDelay } from '../../lib/glow';
import { mix, type ThemeColors } from '../../lib/themeColors';
import type { Touch } from '../../state/derived';
import { LABEL_H, type Cell, type MapLayout } from './tree';

export interface DrawOpts {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  layout: MapLayout;
  colors: ThemeColors;
  touched: Map<string, Touch>;
  /** "Now" for fading: the wall clock when live, the replay clock when replaying. */
  now: number;
  selected: string | null;
  hover: Cell | null;
  /** Fade out files Claude hasn't touched (focus on where it has been). */
  dimUntouched: boolean;
  /** No pulsing/flashing. */
  calm: boolean;
  /** Is a shell command running right now? (the map border shimmers in the RAN color) */
  commandRunning: boolean;
  /** Files an error pointed at: they flash red for a few seconds. */
  flashes: Array<{ ts: number; paths: string[] }>;
}

const FLASH_MS = 3500;

type Category = 'code' | 'doc' | 'config' | 'style' | 'test' | 'other';

const DOC = new Set(['md', 'mdx', 'txt', 'rst', 'adoc']);
const CONFIG = new Set(['json', 'yaml', 'yml', 'toml', 'ini', 'lock', 'env', 'xml', 'cfg']);
const STYLE = new Set(['css', 'scss', 'sass', 'less']);
const TEST_RE = /(\.|_)(test|spec)\.|(^|\/)(tests?|__tests__)\//;

export function categoryOf(path: string, file?: FileInfo): Category {
  if (TEST_RE.test(path)) return 'test';
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (file?.lang) return 'code';
  if (DOC.has(ext)) return 'doc';
  if (CONFIG.has(ext)) return 'config';
  if (STYLE.has(ext)) return 'style';
  return 'other';
}

function fillFor(cat: Category, c: ThemeColors): string {
  switch (cat) {
    case 'doc':
      return mix(c.textDim, 14, c.bgAlt);
    case 'config':
      return c.surface;
    case 'style':
      return mix(c.accent2, 12, c.surfaceHi);
    case 'other':
      return c.bgAlt;
    default:
      return c.surfaceHi;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && w > 2 * r && h > 2 * r) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Shorten text to roughly fit `maxPx` pixels, keeping the END of file names (the extension matters). */
function fit(text: string, maxPx: number, charPx: number): string {
  const max = Math.floor(maxPx / charPx);
  if (text.length <= max) return text;
  if (max <= 2) return '';
  return text.slice(0, max - 1) + '…';
}

/** Draws one frame. Returns when the next redraw is needed (see nextRedrawDelay). */
export function drawMap(o: DrawOpts): number | null {
  const { ctx, width, height, layout, colors: c, touched, now } = o;
  const corner = Math.min(4, c.radius * 0.18);
  const pulse = !o.calm;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bgAlt;
  ctx.fillRect(0, 0, width, height);

  const glowing: Array<{ x: number; y: number; w: number; h: number; color: string; i: number }> = [];
  const monoFont = `10px ${c.fontMono}`;
  const folderFont = `10px ${c.fontMono}`;
  const charPx = 6; // width of one 10px monospace character

  for (const cell of layout.cells) {
    const n = cell.node;
    const x = cell.x0;
    const y = cell.y0;
    const w = cell.x1 - cell.x0;
    const h = cell.y1 - cell.y0;
    if (w < 1 || h < 1) continue;

    // ---- folders: a bold outlined region with a label tag -------------------------
    if (n.isDir) {
      if (cell.depth === 0) continue;
      const bold = cell.depth === 1;
      ctx.fillStyle = cell.depth % 2 ? mix(c.bg, 78, c.bgAlt) : mix(c.bgAlt, 80, c.surface);
      roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = bold ? mix(c.textDim, 45) : mix(c.border, 100);
      ctx.stroke();

      // a touched folder (e.g. Claude searched inside it) gets a glowing outline
      const ft = touched.get(n.path);
      const fi = glowIntensity(ft, now, pulse);
      if (ft && fi > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, fi);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.kind[ft.kind];
        ctx.stroke();
        ctx.restore();
      }

      if (h > LABEL_H + 6 && w > 34) {
        ctx.font = folderFont;
        const label = fit(n.name, w - 12, charPx);
        if (label) {
          ctx.fillStyle = mix(c.bg, 60);
          const tw = Math.min(w - 4, label.length * charPx + 8);
          ctx.fillRect(x + 2, y + 2, tw, LABEL_H - 3);
          ctx.fillStyle = bold ? c.text : c.textDim;
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + 6, y + LABEL_H / 2 + 0.5);
        }
      }
      continue;
    }

    // ---- files: one cell each -----------------------------------------------------
    const t = touched.get(n.path);
    const inten = glowIntensity(t, now, pulse);

    if (n.ghost) {
      // not on disk (yet, or any more): a dashed "ghost" outline in the touch color
      const gk = t?.kind ?? n.ghost;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = c.kind[gk];
      ctx.globalAlpha = Math.max(0.35, inten);
      roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner);
      ctx.stroke();
      ctx.fillStyle = c.kind[gk];
      ctx.globalAlpha = 0.1 + 0.4 * inten;
      ctx.fill();
      ctx.restore();
    } else {
      const cat = n.dust ? 'other' : categoryOf(n.path, n.file);
      const untouchedDim = o.dimUntouched && !t;
      ctx.globalAlpha = untouchedDim ? 0.28 : 1;
      ctx.fillStyle = fillFor(cat, c);
      roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner);
      ctx.fill();
      if (cat === 'test') {
        ctx.save();
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = mix(c.good, 70);
        ctx.stroke();
        ctx.restore();
      } else if (w > 4 && h > 4) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = mix(c.border, 55);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the light-up: the touch color flooding the cell
      if (t && inten > 0) {
        const color = c.kind[t.kind];
        ctx.globalAlpha = Math.min(1, 0.1 + 0.45 * inten);
        ctx.fillStyle = color;
        roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (inten > 0.5 && w > 5) glowing.push({ x, y, w, h, color, i: inten });
      }
    }

    // ---- labels -----------------------------------------------------------------
    if (w > 44 && h > 13) {
      ctx.font = monoFont;
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.text;
      ctx.globalAlpha = o.dimUntouched && !t ? 0.45 : 0.92;
      ctx.fillText(fit(n.name, w - 8, charPx), x + 4, y + 3);
      if (h > 27 && w > 56 && !n.ghost) {
        ctx.globalAlpha = 0.55;
        ctx.fillText(n.dust ? `${n.value} lines` : `${n.file?.lines ?? ''} lines`, x + 4, y + 15);
      }
      ctx.globalAlpha = 1;
    }
  }

  // The brightest cells get a soft outer glow (limited to 40 so it stays fast).
  glowing.sort((a, b) => b.i - a.i);
  ctx.save();
  for (const g of glowing.slice(0, 40)) {
    ctx.shadowColor = g.color;
    ctx.shadowBlur = 8 + 14 * g.i;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = Math.min(1, g.i);
    roundedRect(ctx, g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1, corner);
    ctx.stroke();
  }
  ctx.restore();

  // Error flashes: files named in a stack trace blink red (so you see WHERE it went wrong).
  let flashing = false;
  for (const f of o.flashes) {
    const age = now - f.ts;
    if (age < 0 || age > FLASH_MS) continue;
    const k = 1 - age / FLASH_MS;
    for (const p of f.paths) {
      const cell = layout.byPath.get(p);
      if (!cell) continue;
      flashing = true;
      const x = cell.x0;
      const y = cell.y0;
      const w = cell.x1 - cell.x0;
      const h = cell.y1 - cell.y0;
      ctx.save();
      ctx.globalAlpha = (o.calm ? 0.6 : 0.35 + 0.35 * Math.sin(age / 90)) * k + 0.15 * k;
      ctx.fillStyle = c.bad;
      roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, k + 0.2);
      ctx.strokeStyle = c.bad;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = c.bad;
      ctx.shadowBlur = o.calm ? 0 : 16 * k;
      ctx.stroke();
      ctx.restore();
    }
  }

  // A command is running: it touches no particular file, so the whole map gets a yellow rim.
  if (o.commandRunning) {
    ctx.save();
    ctx.strokeStyle = c.kind.run;
    ctx.lineWidth = 3;
    ctx.globalAlpha = o.calm ? 0.8 : 0.55 + 0.35 * Math.sin(now / 160);
    ctx.shadowColor = c.kind.run;
    ctx.shadowBlur = o.calm ? 0 : 14;
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
    ctx.restore();
  }

  // selection + hover outlines
  const outline = (cell: Cell | null, color: string, lw: number) => {
    if (!cell) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    roundedRect(ctx, cell.x0 + 0.5, cell.y0 + 0.5, cell.x1 - cell.x0 - 1, cell.y1 - cell.y0 - 1, corner);
    ctx.stroke();
  };
  if (o.selected) outline(layout.byPath.get(o.selected) ?? null, c.accent2, 2.4);
  if (o.hover && o.hover.node.path !== o.selected) outline(o.hover, c.text, 1.4);

  return o.commandRunning || flashing ? 0 : nextRedrawDelay(touched, now);
}

/** The deepest cell under the point (x, y), or null. Cells are stored shallow-to-deep, so search backwards. */
export function hitTest(layout: MapLayout, x: number, y: number): Cell | null {
  const cells = layout.cells;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (c.depth > 0 && x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1) return c;
  }
  return null;
}
