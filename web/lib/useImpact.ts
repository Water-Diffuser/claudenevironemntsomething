// Shared by the graph and the impact panel: the code graph, and "what depends on the thing Claude just changed?".
import { useMemo } from 'react';
import { useScan } from '../state/scan';
import { useDerived } from '../state/store';
import { useUI } from '../state/ui';
import { getCodeGraph, symbolsOverlapping, type CodeGraph } from './codeGraph';
import { computeImpact, type Impact } from './impact';
import { useDebounced } from './useDebounced';

/** The code graph, rebuilt (at most about once a second) as the background analysis fills in. */
export function useCodeGraph(): CodeGraph {
  const files = useScan((s) => s.files);
  const version = useScan((s) => s.analysisVersion);
  const settled = useDebounced(version, 600);
  return useMemo(() => getCodeGraph(files, settled), [files, settled]);
}

export interface ImpactInfo {
  impact: Impact | null;
  /** What the impact is about, e.g. "src/app.ts" or "greet()". */
  label: string;
  /** True when it follows Claude's latest edit (rather than something you picked). */
  auto: boolean;
}

export function useImpact(): ImpactInfo {
  const d = useDerived();
  const target = useUI((s) => s.impactTarget);
  const graph = useCodeGraph();
  const files = useScan((s) => s.files);
  // Follow the latest edit to a CODE file (a note or README can't break anything); otherwise just the latest edit.
  const lastEdit = [...d.edits].reverse().find((e) => files.get(e.path)?.lang) ?? d.edits[d.edits.length - 1];

  return useMemo(() => {
    let path: string | undefined;
    let symbolIds: string[] = [];
    let auto = false;
    if (target) (path = target.path), (symbolIds = target.symbolIds);
    else if (lastEdit) {
      path = lastEdit.path;
      symbolIds = symbolsOverlapping(graph, lastEdit.path, lastEdit.newRanges).map((s) => s.id);
      auto = true;
    }
    if (!path) return { impact: null, label: '', auto };
    const first = symbolIds[0] ? graph.symbols.get(symbolIds[0]) : undefined;
    const label = symbolIds.length === 1 && first ? `${first.qname}()` : path;
    return { impact: computeImpact(graph, path, symbolIds), label, auto };
    // `d` is updated in place: its edit count tells us when a new edit arrived
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, target, lastEdit?.id]);
}
