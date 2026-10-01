// Canvas can't read CSS variables by itself, so we look the current values up once per theme change.
import { KINDS, type Kind } from '@shared/events';

export interface ThemeColors {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceHi: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accent2: string;
  good: string;
  bad: string;
  warn: string;
  shade: string;
  light: string;
  kind: Record<Kind, string>;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  /** Corner roundness in px. */
  radius: number;
}

export function readThemeColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    bg: v('--c-bg'),
    bgAlt: v('--c-bg-alt'),
    surface: v('--c-surface'),
    surfaceHi: v('--c-surface-hi'),
    border: v('--c-border'),
    text: v('--c-text'),
    textDim: v('--c-text-dim'),
    accent: v('--c-accent'),
    accent2: v('--c-accent-2'),
    good: v('--c-good'),
    bad: v('--c-bad'),
    warn: v('--c-warn'),
    shade: v('--c-shade'),
    light: v('--c-light'),
    kind: Object.fromEntries(KINDS.map((k) => [k, v(`--k-${k}`)])) as Record<Kind, string>,
    fontDisplay: v('--f-display'),
    fontBody: v('--f-body'),
    fontMono: v('--f-mono'),
    radius: parseFloat(v('--radius')) || 0,
  };
}

/** A CSS color string mixing `a` (pct %) into `b`. Works in canvas in all modern browsers. */
export const mix = (a: string, pct: number, b = 'transparent') => `color-mix(in srgb, ${a} ${Math.round(pct * 100) / 100}%, ${b})`;
