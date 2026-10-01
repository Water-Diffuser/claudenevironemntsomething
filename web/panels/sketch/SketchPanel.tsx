// ============================================================================
//  "Floor Plan": ask Claude to describe the project's structure as a Mermaid
//  diagram, and draw it here. (Mermaid turns a few lines of text into a diagram.)
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Loader2, Ruler, Square } from 'lucide-react';
import { askSketch, cancelSide, useSide } from '../../state/side';
import { readThemeColors } from '../../lib/themeColors';
import { send, useApp } from '../../state/store';
import { useThemeRev } from '../../theme/themeRev';

/** Pull the diagram out of Claude's reply (it should be inside a ```mermaid fence). */
function extractMermaid(text: string): string | null {
  const fenced = /```(?:mermaid)?\s*\n([\s\S]*?)```/.exec(text);
  if (fenced) return fenced[1].trim();
  const bare = /^\s*(flowchart|graph)\s/m.exec(text);
  return bare ? text.slice(bare.index).trim() : null;
}

export default function SketchPanel() {
  const tasks = useSide((s) => s.tasks).filter((t) => t.kind === 'sketch');
  const currentId = useSide((s) => s.currentSketch);
  const current = tasks.find((t) => t.id === currentId) ?? tasks[tasks.length - 1];
  const cwd = useApp((s) => s.server?.cwd);
  const themeRev = useThemeRev((s) => s.rev);
  const code = useMemo(() => (current ? extractMermaid(current.text) : null), [current?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  const [svg, setSvg] = useState('');
  const [natural, setNatural] = useState({ w: 600, h: 400 });
  const area = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  // Draw the diagram once the answer is complete (and again if the theme changes).
  useEffect(() => {
    if (!code || current?.state !== 'done') return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default; // loaded only when first needed (it is big)
        const c = readThemeColors();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: c.fontBody,
          themeVariables: {
            background: 'transparent',
            primaryColor: c.surfaceHi,
            primaryTextColor: c.text,
            primaryBorderColor: c.accent,
            secondaryColor: c.surface,
            tertiaryColor: c.bgAlt,
            lineColor: c.accent2,
            textColor: c.text,
            edgeLabelBackground: c.bgAlt,
            clusterBkg: c.surface,
          },
        });
        const { svg } = await mermaid.render(`sketch-${Date.now()}`, code);
        if (cancelled) return;
        // Work out the diagram's natural size, so we can scale it to fit the panel.
        const m = /viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
        const natural = m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : { w: 600, h: 400 };
        const box = area.current?.getBoundingClientRect();
        const fit = box ? Math.min(4, (box.width - 24) / natural.w, (box.height - 24) / natural.h) : 1;
        setNatural(natural);
        setSvg(svg.replace(/(<svg[^>]*?)\s(?:width|height)="[^"]*"/g, '$1').replace(/style="max-width:[^"]*"/, ''));
        setError('');
        setView({ s: Math.max(0.2, fit), x: 0, y: 0 });
      } catch (err) {
        if (!cancelled) (setSvg(''), setError(String((err as Error)?.message ?? err).split('\n')[0]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, current?.state, themeRev]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5 text-xs">
        <button className="btn btn-primary !px-2.5 !py-1 text-xs" disabled={!cwd || current?.state === 'running'} onClick={() => askSketch(send)}>
          <Ruler size={13} /> {current ? 'Sketch again' : 'Sketch the architecture'}
        </button>
        {current?.state === 'running' && (
          <>
            <span className="flex min-w-0 items-center gap-1.5 text-dim">
              <Loader2 size={13} className="shrink-0 animate-spin" /> <span className="truncate">{current.status || 'Looking around…'}</span>
            </span>
            <button className="btn btn-danger ml-auto !px-2 !py-0.5 text-xs" onClick={() => cancelSide(send, current.id)}>
              <Square size={11} fill="currentColor" /> stop
            </button>
          </>
        )}
        {code && current?.state === 'done' && (
          <button className="btn btn-ghost ml-auto !px-2 !py-0.5 text-xs" onClick={() => navigator.clipboard?.writeText(code)} title="Copy the Mermaid code">
            <Copy size={12} /> copy code
          </button>
        )}
      </div>

      <div
        ref={area}
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={(e) => svg && setView((v) => ({ ...v, s: Math.min(4, Math.max(0.3, v.s * (e.deltaY < 0 ? 1.12 : 0.89))) }))}
        onPointerDown={(e) => ((drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }), e.currentTarget.setPointerCapture(e.pointerId))}
        onPointerMove={(e) => drag.current && setView((v) => ({ ...v, x: drag.current!.vx + e.clientX - drag.current!.x, y: drag.current!.vy + e.clientY - drag.current!.y }))}
        onPointerUp={() => (drag.current = null)}
        style={{ cursor: svg ? 'grab' : 'default', touchAction: 'none' }}
      >
        {!current && (
          <div className="grid h-full place-items-center p-6 text-center text-dim">
            <div>
              <Ruler className="mx-auto mb-2 text-accent" size={26} />
              <div className="mb-1 font-display text-lg text-accent-2">No floor plan yet</div>
              Press the button and Claude will look through the project and draw how its parts fit together.
            </div>
          </div>
        )}
        {current?.state === 'running' && current.text && <pre className="m-0 h-full overflow-auto p-3 font-mono text-xs text-dim">{current.text}</pre>}
        {svg && (
          <div
            className="absolute left-1/2 top-1/2"
            style={{ width: natural.w, height: natural.h, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: 'center' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        {current?.state === 'error' && current.error !== 'cancelled' && <div className="m-3 rounded-md border border-bad/60 bg-bad/10 px-3 py-2 text-sm text-bad">{current.error}</div>}
        {current?.state === 'done' && !svg && (
          <div className="p-3 text-sm">
            <div className="mb-2 text-bad">{error ? `The diagram could not be drawn: ${error}` : code ? 'Drawing…' : "Claude's reply did not contain a diagram."}</div>
            <pre className="m-0 overflow-auto rounded-md border border-line bg-bg/60 p-2 font-mono text-xs">{current.text}</pre>
          </div>
        )}
      </div>
      {current?.state === 'done' && svg && <div className="shrink-0 border-t border-line px-2 py-0.5 text-[0.66rem] text-dim">scroll to zoom · drag to move{current.costUsd ? ` · cost $${current.costUsd.toFixed(3)}` : ''}</div>}
    </div>
  );
}
