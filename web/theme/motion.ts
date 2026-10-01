// Small helpers so Framer Motion animations follow the "animation speed" setting.
import { motionState } from './applyTheme';

/** Scale a duration (in seconds) by the theme's animation speed. Calm mode = instant. */
export const dur = (seconds: number) => (motionState.calm ? 0 : seconds / motionState.speed);
