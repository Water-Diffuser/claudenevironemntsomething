// ============================================================================
//  MODELS AND EFFORT
//  Small shared types + helpers for the model / effort / thinking pickers.
//  Both the server (which passes the choice to Claude) and the browser (which
//  shows the pickers) import this file, so they always agree on the rules.
// ============================================================================

/** How hard Claude thinks and works on a reply. Same names the Claude Agent SDK uses. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Lowest to highest. The order matters: it is used to pick the "closest" level. */
export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Extended thinking.
 *   auto = let Claude decide when (and how much) to think. This is the SDK default.
 *   off  = never think before replying (faster and cheaper, a bit less careful).
 */
export type ThinkingChoice = 'auto' | 'off';

/** One row in the model picker. */
export interface ModelChoice {
  /** What we hand to the SDK, e.g. "sonnet" or "claude-sonnet-5-5". "default" = whatever Claude Code would pick. */
  value: string;
  /** Name shown in the picker. */
  label: string;
  description: string;
  /** The effort levels this model accepts. Empty = the model has no effort setting. */
  efforts: EffortLevel[];
  /** Can this model decide for itself when to think? (If not, the thinking toggle is hidden.) */
  adaptiveThinking: boolean;
}

/** "default" and null both mean "don't force a model". */
export const isDefaultModel = (value: string | null | undefined): boolean => !value || value === 'default';

/** Look up a model row by value (null/"default" finds the "default" row if there is one). */
export function findModel(models: ModelChoice[], value: string | null | undefined): ModelChoice | undefined {
  const wanted = isDefaultModel(value) ? 'default' : value;
  return models.find((m) => m.value === wanted);
}

/** The effort levels the chosen model accepts. */
export function effortsFor(models: ModelChoice[], value: string | null | undefined): EffortLevel[] {
  return findModel(models, value)?.efforts ?? [];
}

/**
 * Make an effort choice legal for a model.
 *   - model has no effort setting  -> null (nothing is sent)
 *   - level is supported           -> unchanged
 *   - level is not supported       -> the highest supported level that is not above it
 *                                     (or the lowest supported one if all of them are higher)
 */
export function clampEffort(supported: EffortLevel[], wanted: EffortLevel | null): EffortLevel | null {
  if (!wanted || supported.length === 0) return null;
  if (supported.includes(wanted)) return wanted;
  const rank = (e: EffortLevel) => EFFORT_LEVELS.indexOf(e);
  const sorted = [...supported].sort((a, b) => rank(a) - rank(b));
  const below = sorted.filter((e) => rank(e) <= rank(wanted));
  return below.length ? below[below.length - 1] : sorted[0];
}

/** One entry in the "/" menu that is a real Claude Code command or skill (e.g. /compact, /review). */
export interface CommandChoice {
  /** Without the leading slash. */
  name: string;
  description: string;
  /** e.g. "<file>": shown after the name so you know what to type next. */
  argumentHint?: string;
}
