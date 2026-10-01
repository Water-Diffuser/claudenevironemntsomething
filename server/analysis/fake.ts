// ============================================================================
//  fake.ts: explanations and architecture sketches WITHOUT Claude.
//  Used in Rehearsal mode (and as a fallback). They are written straight from the
//  code analysis, so they are plain and a bit mechanical, but always correct.
// ============================================================================
import path from 'node:path';
import type { SideTarget } from '../../shared/protocol.ts';
import type { ProjectService } from './project.ts';

const list = (items: string[], max = 6) => items.slice(0, max).map((i) => `- \`${i}\``).join('\n') + (items.length > max ? `\n- …and ${items.length - max} more` : '');

export function explainFromScan(project: ProjectService, target: SideTarget): string {
  const file = project.fileInfo(target.path);
  if (!file) return `I can't find \`${target.path}\` in the project scan.`;
  const resolved = [...new Set((file.imports ?? []).filter((i) => i.resolved).map((i) => i.resolved as string))];
  const external = [...new Set((file.imports ?? []).filter((i) => !i.resolved).map((i) => i.spec))];
  const usedBy = project.importedBy(target.path);
  const note = '\n\n*Rehearsal mode: this was written from the code analysis, not by Claude. Switch to Live for a real explanation.*';

  if (target.symbol) {
    const sym = file.symbols?.find((s) => (s.parent ? `${s.parent}.${s.name}` : s.name) === target.symbol || s.name === target.symbol);
    if (!sym) return `I couldn't find \`${target.symbol}\` in \`${target.path}\`.` + note;
    const calls = sym.calls.map((c) => (c.receiver ? `${c.receiver}.` : '') + c.name);
    return (
      `**\`${target.symbol}\`** is a ${sym.kind} in \`${target.path}\`, on lines ${sym.startLine}–${sym.endLine}` +
      `${sym.exported ? ' (other files can use it)' : ' (only used inside this file)'}.\n\n` +
      (calls.length ? `**It uses:**\n${list(calls)}\n\n` : 'It does not call anything else we could detect.\n\n') +
      `**The file it lives in** has ${file.lines} lines and is used by ${usedBy.length} other file${usedBy.length === 1 ? '' : 's'}.` +
      note
    );
  }

  const defs = (file.symbols ?? []).filter((s) => s.kind !== 'method').map((s) => `${s.name} (${s.kind})`);
  return (
    `**\`${path.basename(target.path)}\`** is a ${file.lang ?? 'text'} file with ${file.lines.toLocaleString()} lines.\n\n` +
    (defs.length ? `**It defines:**\n${list(defs)}\n\n` : '') +
    (resolved.length ? `**It depends on these project files:**\n${list(resolved)}\n\n` : 'It does not import other files from this project.\n\n') +
    (external.length ? `**Outside packages it uses:** ${external.slice(0, 8).join(', ')}${external.length > 8 ? '…' : ''}\n\n` : '') +
    (usedBy.length ? `**These files depend on it:**\n${list(usedBy)}` : 'No other file imports it, so it is likely an entry point, a script, or unused.') +
    note
  );
}

/** A Mermaid flowchart of the project's top-level folders and how they import each other. */
export function sketchFromScan(project: ProjectService): string {
  const files = project.allFiles();
  // Group by the first folder; if everything lives in one folder (like "src"), group by the second.
  const tops = new Set(files.map((f) => f.path.split('/')[0]).filter((_, i, a) => a.length > 0));
  const depth = tops.size <= 2 && files.some((f) => f.path.split('/').length > 2) ? 2 : 1;
  const group = (p: string) => {
    const parts = p.split('/');
    return parts.length <= depth ? '(root files)' : parts.slice(0, depth).join('/');
  };
  const sizes = new Map<string, number>();
  for (const f of files) sizes.set(group(f.path), (sizes.get(group(f.path)) ?? 0) + 1);
  const keep = new Set([...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g));
  const g2 = (p: string) => (keep.has(group(p)) ? group(p) : 'other');
  const id = (name: string) => 'n' + [...keep, 'other'].indexOf(name);

  const edges = new Map<string, number>();
  for (const f of files) {
    for (const imp of f.imports ?? []) {
      if (!imp.resolved) continue;
      const a = g2(f.path);
      const b = g2(imp.resolved);
      if (a !== b) edges.set(`${a}\u0000${b}`, (edges.get(`${a}\u0000${b}`) ?? 0) + 1);
    }
  }
  const names = [...keep, ...(files.some((f) => !keep.has(group(f.path))) ? ['other'] : [])];
  const lines = ['flowchart TD'];
  for (const n of names) lines.push(`  ${id(n)}["${n.replace(/"/g, '')}<br/>${n === 'other' ? '' : (sizes.get(n) ?? 0) + ' files'}"]`);
  for (const [k, w] of edges) {
    const [a, b] = k.split('\u0000');
    lines.push(`  ${id(a)} -->|${w}| ${id(b)}`);
  }
  return '```mermaid\n' + lines.join('\n') + '\n```\n\n*Rehearsal mode: this sketch is computed from the imports between folders, not written by Claude.*';
}
