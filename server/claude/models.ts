// ============================================================================
//  models.ts: ask Claude which models your account can use.
//
//  The SDK can only answer this from a running query (supportedModels() is a
//  method on it). So we start one with a prompt stream that NEVER sends a
//  message: Claude Code boots, answers our question, and sits waiting. No
//  request goes to the API, so it costs nothing. Then we shut it down.
// ============================================================================
import { query, type ModelInfo, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '@config';
import { EFFORT_LEVELS, type CommandChoice, type ModelChoice } from '@shared/models';
import { cleanEnv } from './live';

/** Turn the SDK's model description into the smaller shape the UI needs. */
export function toChoice(m: ModelInfo): ModelChoice {
  // Keep only effort levels we know how to show, in low-to-high order.
  const known = new Set(m.supportsEffort === false ? [] : (m.supportedEffortLevels ?? []));
  return {
    value: m.value,
    label: m.displayName || m.value,
    description: m.description ?? '',
    efforts: EFFORT_LEVELS.filter((e) => known.has(e)),
    adaptiveThinking: !!m.supportsAdaptiveThinking,
  };
}

/** What we learn from Claude in one go: the models you can pick and the "/" commands it has. */
export interface LiveInfo {
  models: ModelChoice[];
  commands: CommandChoice[];
}

/** Resolves with the live info, or rejects (timeout, no login...). The caller falls back to the config lists. */
export async function fetchLiveInfo(cwd: string, timeoutMs = 20000): Promise<LiveInfo> {
  const abort = new AbortController();

  // A prompt stream that waits forever (until we abort) and never yields a message.
  async function* silence(): AsyncGenerator<SDKUserMessage> {
    await new Promise<void>((resolve) => abort.signal.addEventListener('abort', () => resolve(), { once: true }));
  }

  const q = query({
    prompt: silence(),
    options: { cwd, abortController: abort, settingSources: config.app.settingSources, env: cleanEnv() },
  });

  let timer: NodeJS.Timeout | undefined;
  try {
    const [list, commands] = await Promise.race([
      // (the commands are a nice-to-have: if that question fails, we still show the models)
      Promise.all([q.supportedModels(), q.supportedCommands().catch(() => [])]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Claude did not answer the model question in time.')), timeoutMs);
      }),
    ]);
    if (!list.length) throw new Error('Claude returned an empty model list.');
    return {
      models: list.map(toChoice),
      commands: commands.map((c) => ({ name: c.name, description: c.description ?? '', argumentHint: c.argumentHint || undefined })),
    };
  } finally {
    clearTimeout(timer);
    abort.abort(); // lets the silent stream end
    try {
      q.close();
    } catch {
      /* already closed: fine */
    }
  }
}
