// ============================================================================
//  "Liner Notes": a short plain-English explanation of any file or function.
//  Click something on the map or graph, then press Explain. A separate, read-only
//  Claude call writes it (see server/claude/side.ts); it never touches your code.
// ============================================================================
import { Loader2, RotateCw, NotebookPen, Square } from 'lucide-react';
import { Markdown } from '../../components/Markdown';
import { askExplain, cancelSide, useSide } from '../../state/side';
import { send } from '../../state/store';
import { useUI } from '../../state/ui';

export default function ExplainPanel() {
  const tasks = useSide((s) => s.tasks).filter((t) => t.kind === 'explain');
  const currentId = useSide((s) => s.currentExplain);
  const selectedFile = useUI((s) => s.selectedFile);
  const selectedSymbol = useUI((s) => s.selectedSymbol);

  const current = tasks.find((t) => t.id === currentId) ?? tasks[tasks.length - 1];
  const target = selectedFile ? { path: selectedFile, symbol: selectedSymbol?.qname, startLine: selectedSymbol?.startLine, endLine: selectedSymbol?.endLine } : null;
  const targetName = selectedSymbol ? `${selectedSymbol.qname}()` : selectedFile;
  const alreadyShown = current && target && current.target?.path === target.path && current.target?.symbol === target.symbol;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {target && !alreadyShown && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-xs">
          <span className="min-w-0 truncate font-mono text-ink" title={targetName ?? ''}>
            {targetName}
          </span>
          <button className="btn btn-primary ml-auto !px-2.5 !py-1 text-xs" onClick={() => askExplain(send, target)}>
            <NotebookPen size={13} /> Explain
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!current ? (
          <div className="grid h-full place-items-center p-4 text-center text-dim">
            <div>
              <NotebookPen className="mx-auto mb-2 text-accent" size={24} />
              <div className="mb-1 empty-title !text-lg">Pick something to understand</div>
              Click a file on the map, or a file or function in the graph, then press <b>Explain</b>. You get a short plain-English summary.
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="m-0 min-w-0 truncate font-mono text-sm text-ink" title={current.title}>
                {current.title}
              </h3>
              {current.state === 'running' ? (
                <button className="btn btn-danger ml-auto !px-2 !py-0.5 text-xs" onClick={() => cancelSide(send, current.id)}>
                  <Square size={11} fill="currentColor" /> stop
                </button>
              ) : (
                current.target && (
                  <button className="btn btn-ghost ml-auto !px-2 !py-0.5 text-xs" onClick={() => askExplain(send, current.target!, true)} title="Ask again">
                    <RotateCw size={12} /> again
                  </button>
                )
              )}
            </div>
            {current.target?.symbol && <div className="mb-2 text-xs text-dim">in {current.target.path}</div>}
            {current.state === 'running' && !current.text && (
              <div className="flex items-center gap-2 text-sm text-dim">
                <Loader2 size={14} className="animate-spin" /> {current.status || 'Thinking…'}
              </div>
            )}
            {current.state === 'running' && current.text && current.status && <div className="mb-1 text-xs text-dim">{current.status}</div>}
            {current.text && <Markdown text={current.text} />}
            {current.state === 'error' && current.error !== 'cancelled' && <div className="mt-2 rounded-md border border-bad/60 bg-bad/10 px-3 py-2 text-sm text-bad">{current.error}</div>}
            {current.state === 'done' && current.costUsd ? <div className="mt-2 text-xs text-dim">cost ${current.costUsd.toFixed(3)}</div> : null}
          </>
        )}
      </div>

      {tasks.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line px-2 py-1" aria-label="Earlier explanations">
          {[...tasks].reverse().slice(0, 12).map((t) => (
            <button key={t.id} className={`chip shrink-0 hover:border-accent ${t.id === current?.id ? 'border-accent text-ink' : ''}`} onClick={() => useSide.setState({ currentExplain: t.id })}>
              {t.title.split('/').pop()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
