// ============================================================================
//  eventMapper.ts: SDK messages  ->  our simple SessionEvents.
//
//  The Claude Agent SDK streams many kinds of messages. We only care about a
//  few, and we reshape them into the flat events defined in shared/events.ts.
//  The SAME mapper is used for real Claude, for the scripted "rehearsal"
//  session, and when re-reading old sessions, so they all look identical.
// ============================================================================
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { SessionEventBody, TodoItem } from '@shared/events';
import { describeTool, flattenResult, locateInFile, pathsFromOutput, trimInput, trimText } from './toolInfo';

export interface MapperSink {
  /** Add an event to the log. */
  emit(body: SessionEventBody): void;
  /** Stream a piece of text right now (not stored; the final text arrives via emit). */
  delta(messageId: string, text: string): void;
  /** The SDK told us which session/model we are running. */
  onInit(info: { sessionId: string; model?: string; authSource?: string }): void;
}

/** Minimal shape of the content blocks we read (the SDK types are very large). */
interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** Friendly explanations for the errors people actually hit. */
const ERROR_HELP: Record<string, string> = {
  authentication_failed:
    'Claude could not log in. Put your key in the .env file (ANTHROPIC_API_KEY=sk-ant-...) and restart, or switch to Rehearsal mode at the top.',
  billing_error: 'Your Anthropic account has a billing problem. Check console.anthropic.com → Billing.',
  rate_limit: 'Rate limit reached. Give it a minute, then try again.',
  overloaded: 'Claude is overloaded right now. Try again in a moment.',
  model_not_found: 'That model was not found for your account.',
};

export class EventMapper {
  /** Tools that have started but not finished: id -> start time, name, time spent waiting for permission. */
  private open = new Map<string, { t: number; tool: string; waited: number }>();
  private usageSeen = new Set<string>();
  private thinkingSeen = new Set<string>();
  private streamingMessage: string | null = null;

  constructor(
    private cwd: string,
    private sink: MapperSink,
    /** true when re-reading saved history (also keeps the user's own prompts). */
    private replay = false,
  ) {}

  /** The producer took `ms` to answer a permission popup; don't count it as tool run time. */
  addWait(toolId: string, ms: number) {
    const o = this.open.get(toolId);
    if (o) o.waited += ms;
  }

  handle(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system':
        if ((msg as { subtype?: string }).subtype === 'init') {
          const m = msg as unknown as { session_id: string; model?: string; apiKeySource?: string };
          this.sink.onInit({ sessionId: m.session_id, model: m.model, authSource: m.apiKeySource });
        }
        return;
      case 'stream_event':
        return this.handleStream(msg as unknown as { event: any; parent_tool_use_id: string | null });
      case 'assistant':
        return this.handleAssistant(msg as unknown as { message: any; parent_tool_use_id: string | null; error?: string; uuid: string });
      case 'user':
        return this.handleUser(msg as unknown as { message: { content: unknown }; tool_use_result?: unknown });
      case 'result':
        return this.handleResult(msg as any);
      default:
        return; // dozens of other message types exist; we do not need them.
    }
  }

  // ---- streaming text -------------------------------------------------------
  private handleStream(msg: { event: any; parent_tool_use_id: string | null }) {
    if (msg.parent_tool_use_id) return; // ignore sub-agents' token streams
    const ev = msg.event;
    if (ev.type === 'message_start') {
      this.streamingMessage = ev.message?.id ?? null;
    } else if (ev.type === 'content_block_delta' && this.streamingMessage) {
      if (ev.delta?.type === 'text_delta' && ev.delta.text) this.sink.delta(this.streamingMessage, ev.delta.text);
      else if (ev.delta?.type === 'thinking_delta') this.noteThinking(this.streamingMessage);
    }
  }

  private noteThinking(messageId: string) {
    if (this.thinkingSeen.has(messageId)) return;
    this.thinkingSeen.add(messageId);
    this.sink.emit({ kind: 'thinking', messageId });
  }

  // ---- Claude's finished messages -------------------------------------------
  private handleAssistant(msg: { message: any; parent_tool_use_id: string | null; error?: string; uuid: string }) {
    const m = msg.message;
    const messageId: string = m?.id ?? msg.uuid;
    const blocks: Block[] = Array.isArray(m?.content) ? m.content : [];

    // The SDK reports failures (bad key, rate limit...) as a special assistant message.
    if (msg.error) {
      const original = blocks.map((b) => b.text ?? '').join(' ').trim();
      const help = ERROR_HELP[msg.error] ?? `Claude reported an error (${msg.error}).`;
      this.sink.emit({ kind: 'notice', level: 'error', text: original && !ERROR_HELP[msg.error] ? `${help} ${original}` : help });
      return;
    }

    // Token usage (once per API message; sub-agents have their own context so skip them).
    if (!msg.parent_tool_use_id && m?.usage && !this.usageSeen.has(messageId)) {
      this.usageSeen.add(messageId);
      const u = m.usage;
      const inputTokens = u.input_tokens ?? 0;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      const cacheCreate = u.cache_creation_input_tokens ?? 0;
      this.sink.emit({
        kind: 'usage',
        messageId,
        inputTokens,
        outputTokens: u.output_tokens ?? 0,
        cacheRead,
        cacheCreate,
        contextTokens: inputTokens + cacheRead + cacheCreate,
      });
    }

    for (const b of blocks) {
      if (b.type === 'text' && b.text?.trim()) {
        this.sink.emit({ kind: 'assistant_text', messageId, text: b.text });
      } else if (b.type === 'thinking') {
        this.noteThinking(messageId);
      } else if (b.type === 'tool_use' && b.id && b.name) {
        this.toolStart(b.id, b.name, b.input ?? {}, msg.parent_tool_use_id);
      }
    }
  }

  private toolStart(toolId: string, tool: string, input: Record<string, unknown>, parent: string | null) {
    if (this.open.has(toolId)) return;
    const d = describeTool(tool, input, this.cwd);
    this.open.set(toolId, { t: Date.now(), tool, waited: 0 });
    this.sink.emit({
      kind: 'tool_start',
      toolId,
      tool,
      toolKind: d.kind,
      input: trimInput(input),
      paths: d.paths,
      summary: d.summary,
      parentToolId: parent,
      loc: locateInFile(tool, input, this.cwd),
    });
    if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
      this.sink.emit({ kind: 'todos', items: input.todos.map(toTodo) });
    }
  }

  // ---- tool results come back as "user" messages ----------------------------
  private handleUser(msg: { message: { content: unknown }; tool_use_result?: unknown }) {
    const content = msg.message?.content;
    if (typeof content === 'string') {
      // Plain user text. Live, we already logged the prompt ourselves; in replay we keep it.
      if (this.replay && content.trim() && !/^<(command-|local-command|system-reminder)/.test(content.trim())) {
        this.sink.emit({ kind: 'user_message', text: content });
      }
      return;
    }
    if (!Array.isArray(content)) return;
    for (const b of content as Block[]) {
      if (b.type === 'text' && this.replay && b.text?.trim() && !/^<(command-|local-command|system-reminder)/.test(b.text.trim())) {
        this.sink.emit({ kind: 'user_message', text: b.text });
      } else if (b.type === 'tool_result' && b.tool_use_id) {
        const o = this.open.get(b.tool_use_id);
        this.open.delete(b.tool_use_id);
        const tool = o?.tool ?? 'unknown';
        const output = trimText(flattenResult(b.content));
        this.sink.emit({
          kind: 'tool_end',
          toolId: b.tool_use_id,
          ok: !b.is_error,
          output,
          durationMs: o ? Math.max(0, Date.now() - o.t - o.waited) : 0,
          paths: pathsFromOutput(tool, output, this.cwd),
          data: sanitizeData(tool, msg.tool_use_result),
        });
      }
    }
  }

  // ---- end of a turn --------------------------------------------------------
  private handleResult(msg: any) {
    const ok = msg.subtype === 'success' && !msg.is_error;
    const usages = msg.modelUsage ? (Object.values(msg.modelUsage) as Array<{ contextWindow?: number }>) : [];
    const contextWindow = usages.map((u) => u.contextWindow ?? 0).sort((a, b) => b - a)[0] || undefined;
    this.sink.emit({
      kind: 'turn_end',
      ok,
      costUsd: msg.total_cost_usd ?? 0,
      durationMs: msg.duration_ms ?? 0,
      turns: msg.num_turns ?? 0,
      contextWindow,
      error: ok ? undefined : Array.isArray(msg.errors) ? msg.errors.join('; ') : msg.result || undefined,
    });
  }
}

export function toTodo(t: any): TodoItem {
  return { content: String(t?.content ?? ''), status: t?.status ?? 'pending', activeForm: t?.activeForm };
}

/** Keep only the useful, small parts of a tool's structured result. */
function sanitizeData(tool: string, data: unknown): unknown {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, any>;
  switch (tool) {
    case 'Read':
      return d.file ? { file: { filePath: d.file.filePath, startLine: d.file.startLine, numLines: d.file.numLines, totalLines: d.file.totalLines } } : undefined;
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return trimInput({ filePath: d.filePath, type: d.type, structuredPatch: d.structuredPatch }, 20000);
    case 'Bash':
      return { stderr: typeof d.stderr === 'string' ? trimText(d.stderr, 4000) : undefined, interrupted: d.interrupted };
    default:
      return trimInput(d, 4000);
  }
}
