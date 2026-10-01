// ============================================================================
//  live.ts: talk to the REAL Claude Code through the Claude Agent SDK.
//
//  Package: @anthropic-ai/claude-agent-sdk
//  query() starts Claude Code as a child process and gives us back an async
//  stream of messages. Each user prompt = one query(); to continue a
//  conversation we pass `resume: <sessionId>`.
// ============================================================================
import { query, type CanUseTool, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '@config';
import type { PermissionModeName } from '@shared/protocol';

export interface LiveCtx {
  cwd: string;
  prompt: string;
  /** Claude's session id to continue, or null to start a fresh conversation. */
  resumeId: string | null;
  permissionMode: PermissionModeName;
  abort: AbortController;
  canUseTool: CanUseTool;
  /** Called with the running query, so the Stop button can call interrupt() on it. */
  onQuery: (q: Query) => void;
  push: (msg: SDKMessage) => void;
}

/**
 * If you start this app from inside another Claude Code session (e.g. from its terminal),
 * the child process would inherit THAT session's identity (session id, remote-session
 * settings...) and get confused. So we hand the SDK a cleaned copy of the environment.
 * Your API key, proxy settings, and Bedrock/Vertex switches are kept.
 * Set INDULGENT_KEEP_ENV=1 in .env to disable the cleaning.
 */
const OUTER_SESSION_ENV =
  /^(CLAUDECODE|CLAUDE_PID|AI_AGENT|SESSION_INGRESS_URL|CLAUDE_SESSION_INGRESS_TOKEN_FILE|CLAUDE_CODE_(SESSION|REMOTE|CHILD|ENTRYPOINT|MESSAGING|USE_CCR|POST_FOR|SYNC|WORKER|CONTAINER|DIAGNOSTICS|EXECPATH|HOLD|ENVIRONMENT_RUNNER|PROVIDER_MANAGED|ACCOUNT|ORGANIZATION|USER_EMAIL|TEE|INCLUDE_PARTIAL|DISABLE_TERMINAL))/;

export function cleanEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const keep = process.env.INDULGENT_KEEP_ENV === '1';
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (!keep && OUTER_SESSION_ENV.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function runLive(ctx: LiveCtx): Promise<void> {
  const q = query({
    prompt: ctx.prompt,
    options: {
      cwd: ctx.cwd,
      resume: ctx.resumeId ?? undefined,
      abortController: ctx.abort,
      // Stream text word-by-word instead of waiting for whole messages.
      includePartialMessages: true,
      permissionMode: ctx.permissionMode,
      // Called whenever Claude wants to do something that is not pre-approved.
      // Our version pops up the "May I?" window and waits for your answer.
      canUseTool: ctx.canUseTool,
      // Behave like the `claude` terminal app: same tools, same prompt, load CLAUDE.md etc.
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: config.app.settingSources,
      env: cleanEnv(),
    },
  });
  ctx.onQuery(q);
  for await (const msg of q) ctx.push(msg);
}
