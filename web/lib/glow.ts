// How bright should something glow, given when Claude last touched it?
// Used by the map, the graph and the file list so they all fade the same way.
import type { Touch } from '../state/derived';

/** Time for the bright "flash" to fade, and for the faint "recently touched" afterglow to fade (ms). */
const FLASH_MS = 1800;
const AFTERGLOW_MS = 60_000;
const AFTERGLOW_LEVEL = 0.42;

export function glowIntensity(t: Touch | undefined, now: number, pulse: boolean): number {
  if (!t) return 0;
  if (t.active) return pulse ? 0.86 + 0.14 * Math.sin(now / 110) : 1;
  const dt = Math.max(0, now - t.ts);
  const v = Math.max(Math.exp(-dt / FLASH_MS), AFTERGLOW_LEVEL * Math.exp(-dt / AFTERGLOW_MS));
  return v < 0.03 ? 0 : v;
}

/**
 * How soon must we redraw to show the fade smoothly?
 *   0     = every frame (something is flashing)
 *   1000  = once a second (only slow afterglow left)
 *   null  = nothing is glowing, no need to redraw
 */
export function nextRedrawDelay(touched: Map<string, Touch>, now: number): number | null {
  let slow = false;
  for (const t of touched.values()) {
    if (t.active) return 0;
    const dt = now - t.ts;
    if (dt < 6000) return 0;
    if (dt < 170_000) slow = true;
  }
  return slow ? 1000 : null;
}
