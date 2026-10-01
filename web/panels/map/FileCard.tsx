// A small card about the file you clicked: size, language, what Claude did to it, who imports it.
import { useMemo } from 'react';
import { Radar, Sparkles, X } from 'lucide-react';
import { useKindLabels } from '../../state/settings';
import { kindVar } from '../../components/KindIcon';
import { timeAgo } from '../../lib/format';
import { askExplain } from '../../state/side';
import { send, useDerived } from '../../state/store';
import { useUI } from '../../state/ui';
import { useScan } from '../../state/scan';

export function FileCard({ path, onClose }: { path: string; onClose: () => void }) {
  const kindLabels = useKindLabels();
  const d = useDerived();
  const files = useScan((s) => s.files);
  const analysisVersion = useScan((s) => s.analysisVersion);
  const info = files.get(path);
  const history = d.history.get(path) ?? [];
  const setImpactTarget = useUI((s) => s.setImpactTarget);

  /** Files that import this one. */
  const importedBy = useMemo(() => {
    const out: string[] = [];
    for (const f of files.values()) if (f.imports?.some((i) => i.resolved === path)) out.push(f.path);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisVersion, path]);

  const symbols = info?.symbols?.filter((s) => s.kind !== 'method') ?? [];

  return (
    <div className="absolute right-2 top-2 z-10 flex max-h-[calc(100%-1rem)] w-64 flex-col overflow-hidden rounded-lg border border-line bg-surface/95 text-sm shadow-xl backdrop-blur">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="break-all font-mono text-[0.78rem] font-semibold text-accent-2">{path}</div>
          <div className="mt-0.5 text-xs text-dim">
            {info ? `${info.lines.toLocaleString()} lines` : 'not on disk'}
            {info?.lang ? ` · ${info.lang}` : ''}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-dim hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <div className="flex gap-1.5 border-b border-line px-3 py-1.5">
        <button className="btn !px-2 !py-0.5 text-xs" onClick={() => askExplain(send, { path })} title="Ask Claude for a plain-English explanation (see Liner Notes)">
          <Sparkles size={12} /> Explain
        </button>
        <button className="btn !px-2 !py-0.5 text-xs" onClick={() => setImpactTarget({ path, symbolIds: [] })} title="What imports this file? (see Ripples)">
          <Radar size={12} /> What breaks?
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto px-3 py-2">
        <section>
          <div className="mb-1 text-[0.66rem] uppercase tracking-wider text-dim">What Claude did here</div>
          {history.length === 0 && <div className="text-xs text-dim">Nothing yet.</div>}
          <ul className="m-0 list-none space-y-1 p-0">
            {[...history].reverse().slice(0, 8).map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="inline-block size-2 rounded-full" style={{ background: kindVar(h.kind) }} />
                <span className="font-semibold" style={{ color: kindVar(h.kind) }}>
                  {kindLabels[h.kind]}
                </span>
                <span className="text-dim">{h.tool}</span>
                <span className="ml-auto text-dim">{timeAgo(h.ts)}</span>
              </li>
            ))}
          </ul>
        </section>
        {symbols.length > 0 && (
          <section>
            <div className="mb-1 text-[0.66rem] uppercase tracking-wider text-dim">Defines ({symbols.length})</div>
            <ul className="m-0 max-h-28 list-none space-y-0.5 overflow-y-auto p-0 font-mono text-xs">
              {symbols.slice(0, 40).map((s) => (
                <li key={`${s.name}:${s.startLine}`} className="flex gap-2">
                  <span className="text-dim">{s.kind === 'class' ? 'class' : s.kind === 'type' ? 'type' : 'fn'}</span>
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto text-dim">{s.startLine}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <div className="mb-1 text-[0.66rem] uppercase tracking-wider text-dim">
            Imports {info?.imports?.filter((i) => i.resolved).length ?? 0} files · used by {importedBy.length}
          </div>
          <ul className="m-0 max-h-24 list-none space-y-0.5 overflow-y-auto p-0 font-mono text-xs text-dim">
            {importedBy.slice(0, 20).map((p) => (
              <li key={p} className="truncate">← {p}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
