// ============================================================================
//  rehearsal.ts: a scripted FAKE Claude session.
//
//  Why it exists: it lets you (and me, while building) see the whole dashboard
//  working with no API key and no cost. It produces messages shaped exactly
//  like the real SDK's, so everything downstream (mapper, UI) is the same code
//  as for real Claude. It NEVER changes your files: "edits" are only pretend.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import type { CanUseTool, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '@config';

interface RehearsalCtx {
  cwd: string;
  prompt: string;
  sessionId: string;
  signal: AbortSignal;
  /** "default" asks before edits/commands, "acceptEdits" only before commands, "plan" never changes anything. */
  permissionMode: 'default' | 'acceptEdits' | 'plan';
  canUseTool: CanUseTool;
  /** Called for each message we "receive from Claude". */
  push: (msg: SDKMessage) => void;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('aborted', 'AbortError'))), { once: true });
  });

let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

// ---- find some real files in the project to talk about ----------------------
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.java', '.rb', '.css', '.html']);
const ignore = new Set(config.scan.ignoreDirs);

function walk(root: string, limit = 400): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.isDirectory()) continue;
      if (e.isDirectory()) {
        if (!ignore.has(e.name)) stack.push(path.join(dir, e.name));
      } else out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  }
  return out;
}

function pickFiles(cwd: string) {
  const all = walk(cwd);
  const code = all.filter((f) => CODE_EXT.has(path.extname(f)) && !/\.(test|spec)\./.test(f));
  const sizeOf = (f: string) => {
    try {
      return fs.statSync(path.join(cwd, f)).size;
    } catch {
      return 0;
    }
  };
  // Prefer mid-sized source files (big enough to be interesting, small enough to be quick).
  const candidates = code.filter((f) => sizeOf(f) > 200 && sizeOf(f) < 60_000);
  const pool = candidates.length ? candidates : code;
  const readme = all.find((f) => /^readme(\.md)?$/i.test(f)) ?? all.find((f) => f === 'package.json');
  return { all, readme, source: pool.slice(0, 40) };
}

/** Pick a line we can pretend to change. */
function pickEditLine(cwd: string, files: string[]) {
  for (const f of files) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(cwd, f), 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    const i = lines.findIndex((l, idx) => idx > 2 && l.trim().length > 12 && !/^\s*(\/\/|#|\*|\/\*)/.test(l) && text.indexOf(l) === text.lastIndexOf(l));
    if (i >= 0) {
      const comment = path.extname(f) === '.py' ? '#' : '//';
      return { file: f, oldLine: lines[i], newLine: `${lines[i]}  ${comment} polished` };
    }
  }
  return null;
}

// ---- the performance ---------------------------------------------------------
export async function runRehearsal(ctx: RehearsalCtx): Promise<void> {
  const { signal, push } = ctx;
  const { all, readme, source } = pickFiles(ctx.cwd);
  const edit = pickEditLine(ctx.cwd, source);
  const model = 'rehearsal-voice';
  const started = Date.now();
  let context = 6200 + Math.floor(Math.random() * 800);
  let outTokens = 0;

  push({ type: 'system', subtype: 'init', session_id: ctx.sessionId, model, cwd: ctx.cwd, apiKeySource: 'none', tools: [], mcp_servers: [] } as unknown as SDKMessage);
  await sleep(250, signal);

  /** Stream a paragraph word by word, then deliver the finished message. */
  const say = async (text: string, extra: object[] = []) => {
    const id = uid('msg');
    push({ type: 'stream_event', parent_tool_use_id: null, uuid: uid('u'), session_id: ctx.sessionId, event: { type: 'message_start', message: { id } } } as unknown as SDKMessage);
    for (const word of text.split(/(\s+)/)) {
      if (!word) continue;
      push({ type: 'stream_event', parent_tool_use_id: null, uuid: uid('u'), session_id: ctx.sessionId, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: word } } } as unknown as SDKMessage);
      await sleep(28, signal);
    }
    const words = text.split(/\s+/).length;
    outTokens += Math.ceil(words * 1.4);
    context += 220;
    push({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: uid('u'),
      session_id: ctx.sessionId,
      message: { id, role: 'assistant', content: [{ type: 'text', text }, ...extra], usage: { input_tokens: 400, output_tokens: Math.ceil(words * 1.4), cache_read_input_tokens: context - 400, cache_creation_input_tokens: 0 } },
    } as unknown as SDKMessage);
  };

  /** Pretend Claude calls a tool: announce it, ask permission, "run" it, return a result. */
  const useTool = async (name: string, input: Record<string, unknown>, result: string, opts: { ms?: number; isError?: boolean; data?: unknown } = {}) => {
    const toolUseId = uid('toolu');
    const msgId = uid('msg');
    context += 160;
    push({
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: uid('u'),
      session_id: ctx.sessionId,
      message: { id: msgId, role: 'assistant', content: [{ type: 'tool_use', id: toolUseId, name, input }], usage: { input_tokens: 300, output_tokens: 60, cache_read_input_tokens: context - 300, cache_creation_input_tokens: 0 } },
    } as unknown as SDKMessage);
    outTokens += 60;
    // Like the real thing: reading is free, changing things needs a "May I?" (unless the mode says otherwise).
    const isEdit = name === 'Edit' || name === 'Write' || name === 'MultiEdit';
    const asks = (isEdit && ctx.permissionMode === 'default') || name === 'Bash';
    const decision: Awaited<ReturnType<CanUseTool>> = asks
      ? await ctx.canUseTool(name, input, { signal, toolUseID: toolUseId, requestId: uid('req') } as Parameters<CanUseTool>[2])
      : { behavior: 'allow', updatedInput: input };
    if (!decision || decision.behavior === 'deny') {
      await sleep(120, signal);
      push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: (decision && 'message' in decision && decision.message) || 'The producer said no.' }] } } as unknown as SDKMessage);
      return false;
    }
    await sleep(opts.ms ?? 500, signal);
    push({
      type: 'user',
      parent_tool_use_id: null,
      tool_use_result: opts.data,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: !!opts.isError, content: result }] },
    } as unknown as SDKMessage);
    return true;
  };

  // --- Act 1: look around ---------------------------------------------------
  await say(`Understood: "${ctx.prompt.slice(0, 140)}". This is a rehearsal: I'll walk through your project like a real session, but I won't actually touch a thing.\n\nFirst I'll **taste the structure** before changing anything.`);

  await useTool('TodoWrite', {
    todos: [
      { content: 'Look around the project', activeForm: 'Looking around the project', status: 'in_progress' },
      { content: 'Make one small change', activeForm: 'Making one small change', status: 'pending' },
      { content: 'Run the checks', activeForm: 'Running the checks', status: 'pending' },
    ],
  }, 'Todos have been modified successfully');

  const first = readme ?? all[0];
  if (first) await useTool('Read', { file_path: path.join(ctx.cwd, first) }, `(contents of ${first} would appear here)`, { ms: 450 });

  await useTool('Glob', { pattern: '**/*.{ts,tsx,js,py}' }, source.slice(0, 12).join('\n') || '(no source files found)', { ms: 400 });

  const grepHits = source.slice(0, 3);
  await useTool('Grep', { pattern: 'import|require', output_mode: 'files_with_matches' }, grepHits.join('\n') || '(no matches)', { ms: 450 });

  for (const f of source.slice(0, 3)) {
    await useTool('Read', { file_path: path.join(ctx.cwd, f) }, `(contents of ${f} would appear here)`, { ms: 600 });
  }

  await say('Good, I can see how things fit together. Marking the first course done and moving on to a small, safe change.');

  await useTool('TodoWrite', {
    todos: [
      { content: 'Look around the project', activeForm: 'Looking around the project', status: 'completed' },
      { content: 'Make one small change', activeForm: 'Making one small change', status: 'in_progress' },
      { content: 'Run the checks', activeForm: 'Running the checks', status: 'pending' },
    ],
  }, 'Todos have been modified successfully');

  // --- Act 2: a pretend edit (asks permission) -------------------------------
  if (ctx.permissionMode === 'plan') {
    await say('You have me in **plan mode**, so I will only describe what I would do: add one small note to a file, then run the checks. Nothing is changed in plan mode.');
  } else if (edit) {
    await say(`I'll add a tiny note to \`${edit.file}\`: one line, nothing risky.`);
    const abs = path.join(ctx.cwd, edit.file);
    await useTool('Edit', { file_path: abs, old_string: edit.oldLine, new_string: edit.newLine }, `The file ${abs} has been updated (rehearsal: not really).`, {
      ms: 500,
      data: { filePath: abs, type: 'update', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [`-${edit.oldLine}`, `+${edit.newLine}`] }] },
    });
  }

  // --- Act 3: a pretend command ----------------------------------------------
  if (ctx.permissionMode !== 'plan') await useTool('Bash', { command: 'ls -la', description: 'List the project folder' }, all.slice(0, 8).join('\n'), { ms: 500 });

  await useTool('TodoWrite', {
    todos: [
      { content: 'Look around the project', activeForm: 'Looking around the project', status: 'completed' },
      { content: 'Make one small change', activeForm: 'Making one small change', status: 'completed' },
      { content: 'Run the checks', activeForm: 'Running the checks', status: 'completed' },
    ],
  }, 'Todos have been modified successfully');

  await say('All three courses are served. That was a **rehearsal**: nothing in your project changed. Switch the mode at the top to *Live* to put the real voice on stage.');

  push({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: Date.now() - started,
    num_turns: 6,
    total_cost_usd: 0,
    session_id: ctx.sessionId,
    modelUsage: { [model]: { contextWindow: 200000, inputTokens: context, outputTokens: outTokens } },
  } as unknown as SDKMessage);
}
