// ============================================================================
//  applyTheme.ts: pour a Theme into CSS variables.
//  Every color, font, size and effect in the app reads these variables, so
//  changing a theme = changing a handful of values on <html>. No re-render.
// ============================================================================
import { config } from '@config';
import { KINDS, type Kind } from '@shared/events';
import type { ColorCode, Theme } from '@shared/types';
import { bumpThemeRev } from './themeRev';

/** What gets saved in settings: a preset name plus any tweaks on top of it. */
export interface ThemeSettings {
  base: string;
  overrides: {
    colors?: Partial<Theme['colors']>;
    fonts?: Partial<Theme['fonts']>;
    fontSize?: number;
    radius?: number;
    animSpeed?: number;
    effects?: Partial<Theme['effects']>;
  };
}

export const defaultThemeSettings = (): ThemeSettings => ({ base: config.defaultTheme, overrides: {} });

/** Preset + the user's tweaks = the theme actually shown. */
export function resolveTheme(ts: ThemeSettings): Theme {
  const base = config.themes[ts.base] ?? config.themes[config.defaultTheme];
  const o = ts.overrides ?? {};
  return {
    ...base,
    fontSize: o.fontSize ?? base.fontSize,
    radius: o.radius ?? base.radius,
    animSpeed: o.animSpeed ?? base.animSpeed,
    colors: { ...base.colors, ...o.colors },
    fonts: { ...base.fonts, ...o.fonts },
    effects: { ...base.effects, ...o.effects },
  };
}

/** Default color code, then the theme's tweaks, then the user's own picks. */
export function resolveColorCode(theme: Theme, userCode: Partial<ColorCode> = {}): ColorCode {
  return { ...config.colorCode, ...theme.colorCode, ...userCode };
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** Current animation speed, for code that can't read CSS (like Framer Motion). */
export const motionState = { speed: 1, calm: false };

export function applyTheme(theme: Theme, colorCode: ColorCode, calm: boolean) {
  const root = document.documentElement;
  const set = (k: string, v: string | number) => root.style.setProperty(k, String(v));

  for (const [key, value] of Object.entries(theme.colors)) set(`--c-${kebab(key)}`, value);
  for (const k of KINDS as Kind[]) set(`--k-${k}`, colorCode[k]);

  set('--f-display', theme.fonts.display);
  set('--f-body', theme.fonts.body);
  set('--f-mono', theme.fonts.mono);
  set('--fs-base', `${theme.fontSize}px`);
  set('--radius', `${theme.radius}px`);
  set('--anim', theme.animSpeed);
  set('--motion', calm ? 0 : 1);

  // Calm mode switches off every flashing / glitchy effect.
  const fx = theme.effects;
  set('--fx-scanlines', calm ? 0 : fx.scanlines);
  set('--fx-noise', calm ? 0 : fx.noise);
  set('--fx-glitch', calm ? 0 : fx.glitch);
  set('--fx-glow', calm ? Math.min(fx.glow, 0.3) : fx.glow);
  set('--fx-gloss', fx.gloss);

  root.dataset.calm = String(calm);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  motionState.speed = theme.animSpeed;
  motionState.calm = calm;
  bumpThemeRev();
}
