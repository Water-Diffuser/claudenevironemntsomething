// One icon per color-code kind, always drawn in that kind's color.
import { BookOpen, CircleDot, FilePlus2, Globe, ListChecks, PenLine, Search, Terminal, Trash2, Users, type LucideIcon } from 'lucide-react';
import type { Kind } from '@shared/events';

const byKind: Record<Kind, LucideIcon> = {
  read: BookOpen,
  search: Search,
  edit: PenLine,
  create: FilePlus2,
  delete: Trash2,
  run: Terminal,
  other: CircleDot,
};

/** Some tools get their own icon even though they share a kind. */
const byTool: Record<string, LucideIcon> = {
  WebFetch: Globe,
  WebSearch: Globe,
  TodoWrite: ListChecks,
  Task: Users,
  Agent: Users,
};

export function iconFor(kind: Kind, tool?: string): LucideIcon {
  return (tool && byTool[tool]) || byKind[kind];
}

/** The CSS variable holding this kind's color, e.g. var(--k-edit). */
export const kindVar = (kind: Kind) => `var(--k-${kind})`;

export function KindIcon({ kind, tool, size = 16 }: { kind: Kind; tool?: string; size?: number }) {
  const Icon = iconFor(kind, tool);
  return <Icon size={size} style={{ color: kindVar(kind) }} aria-hidden />;
}
