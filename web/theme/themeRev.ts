// A tiny counter that goes up every time the theme is re-applied.
// Canvas drawing can't use CSS variables directly, so canvas panels watch this
// number and re-read the colors when it changes.
import { create } from 'zustand';

export const useThemeRev = create<{ rev: number }>(() => ({ rev: 0 }));
export const bumpThemeRev = () => useThemeRev.setState((s) => ({ rev: s.rev + 1 }));
