// ============================================================================
//  side.ts: "side questions": explain a file/function, or sketch the architecture.
//
//  These use a SEPARATE Claude call that is only allowed to Read / Grep / Glob.
//  It never edits anything, never appears in your session history, and can't
//  disturb the main conversation.
// ============================================================================
import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from '@config';
import type { SideKind, SideTarget } from '../../shared/protocol.ts';
import { explainFromScan, sketchFromScan } from '../analysis/fake.ts';
import type { ProjectService } from '../analysis/project.ts';
import { cleanEnv } from './live.ts';
import { describeTool } from './toolInfo.ts';

export interface SideRequest {
  kind: SideKind;
  target?: SideTarget;
  cwd: string;
  rehearsal: boolean;
  project: ProjectService;
  signal: AbortSignal;
}

export interface SideSink {
  text: (t: string) => void;
  reset: () => void;
  status: (s: string) => void;
}

const SYSTEM = `You are a patient teacher explaining code to someone who is still learning to program.
Use plain English and short sentences. Avoid jargon, or explain it in a few words when you must use it.
You may use the Read, Grep and Glob tools to look at the project. You cannot and must not change anything.
Be brief and concrete.`;

function buildPrompt(req: SideRequest): string {
  if (req.kind === 'sketch') {
    return `Look at this project (use Glob and Read on the manifest/README and the main entry points) and describe its architecture as a Mermaid diagram.

Reply with ONLY one fenced code block, like:
\`\`\`mermaid
flowchart TD
  A["Browser UI"] --> B["API server"]
\`\`\`

Rules: use "flowchart TD"; at most 18 nodes; each node label is quoted and at most 4 words; show how the main parts depend on or talk to each other; no styling, no subgraphs, no parentheses inside labels.`;
  }
  const t = req.target!;
  const file = req.project.fileInfo(t.path);
  const usedBy = req.project.importedBy(t.path).slice(0, 8);
  const where = t.symbol ? `the ${t.symbol} (lines ${t.startLine ?? '?'}-${t.endLine ?? '?'}) in \`${t.path}\`` : `the file \`${t.path}\``;
  const hints = [
    file?.imports?.length ? `It imports: ${[...new Set(file.imports.map((i) => i.spec))].slice(0, 12).join(', ')}.` : '',
    usedBy.length ? `It is imported by: ${usedBy.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return `Explain ${where} to a beginner.

Format:
1. One sentence: what is it for?
2. Up to 4 short bullets: how does it work, in plain English.
3. One sentence: what else depends on it, or what breaks if it changes?

Keep it under 130 words. Read the code first. ${hints}`;
}

/** Stream text word by word (used for the scripted rehearsal answers). */
async function streamFake(text: string, sink: SideSink, signal: AbortSignal) {
  for (const part of text.split(/(\s+)/)) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    sink.text(part);
    if (part.trim()) await new Promise((r) => setTimeout(r, 14));
  }
}

export async function runSide(req: SideRequest, sink: SideSink): Promise<{ costUsd?: number }> {
  if (req.rehearsal) {
    sink.status('Reading the code analysis…');
    await new Promise((r) => setTimeout(r, 350));
    await streamFake(req.kind === 'sketch' ? sketchFromScan(req.project) : explainFromScan(req.project, req.target!), sink, req.signal);
    return {};
  }

  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const q = query({
    prompt: buildPrompt(req),
    options: {
      cwd: req.cwd,
      abortController: abort,
      systemPrompt: SYSTEM,
      // Read-only: these are the ONLY tools this call can use.
      tools: ['Read', 'Grep', 'Glob'],
      allowedTools: ['Read', 'Grep', 'Glob'],
      permissionMode: 'dontAsk',
      maxTurns: 12,
      persistSession: false, // don't clutter your Claude history
      includePartialMessages: true,
      settingSources: ['project'],
      model: config.app.sideModel,
      env: cleanEnv(),
    },
  });

  let costUsd: number | undefined;
  for await (const msg of q) {
    if (msg.type === 'stream_event' && !msg.parent_tool_use_id) {
      const ev = msg.event as { type: string; delta?: { type?: string; text?: string; stop_reason?: string } };
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) sink.text(ev.delta.text);
      // If this turn ends in a tool call, what we streamed was just "thinking out loud": clear it.
      if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'tool_use') sink.reset();
    } else if (msg.type === 'assistant') {
      for (const b of (msg.message as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> }).content ?? []) {
        if (b.type === 'tool_use' && b.name) sink.status(describeTool(b.name, b.input ?? {}, req.cwd).summary ? `${b.name}: ${describeTool(b.name, b.input ?? {}, req.cwd).summary}` : b.name);
      }
    } else if (msg.type === 'result') {
      costUsd = msg.total_cost_usd;
      if (msg.is_error || msg.subtype !== 'success') throw new Error(('errors' in msg && msg.errors?.join('; ')) || 'Claude could not answer that.');
    }
  }
  return { costUsd };
}
