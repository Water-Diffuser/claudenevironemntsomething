// ============================================================================
//  nodes.tsx: how a node and an edge LOOK in the graph.
//
//  The glow animation trick: a CSS animation lasts 60 seconds (a bright flash that
//  fades to a faint afterglow). We start it "in the past" with a negative
//  animation-delay equal to the time since Claude touched the node. So the browser
//  keeps fading it on its own with zero JavaScript per frame, and replay works too.
// ============================================================================
import { BaseEdge, Handle, Position, useInternalNode, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';
import { Box, FileCode2, FileText, Folder, Zap } from 'lucide-react';
import type { Kind } from '@shared/events';
import type { GNode } from './model';

export interface GNodeData extends Record<string, unknown> {
  node: GNode;
  touchKind?: Kind;
  touchTs?: number;
  touchActive?: boolean;
  /** 0 = the changed thing, 1+ = steps away. undefined = not impacted. */
  impact?: number;
  selected?: boolean;
  dimmed?: boolean;
  /** When an error last pointed at this node (it flashes red). */
  flashTs?: number;
  /** "Now" when this node was rendered (live: wall clock, replay: replay time). */
  now: number;
}

export type GFlowNode = Node<GNodeData, 'g'>;

const HANDLE: CSSProperties = { opacity: 0, width: 1, height: 1, left: '50%', top: '50%', minWidth: 0, minHeight: 0, border: 0 };

function NodeIcon({ node }: { node: GNode }) {
  const p = { size: 13, className: 'shrink-0 opacity-80' };
  switch (node.kind) {
    case 'folder':
      return <Folder {...p} />;
    case 'class':
      return <Box {...p} />;
    case 'fn':
    case 'method':
      return <Zap {...p} />;
    default:
      return /\.(md|txt|json|css|html)$/.test(node.label) ? <FileText {...p} /> : <FileCode2 {...p} />;
  }
}

export const GNodeView = memo(function GNodeView({ data }: NodeProps<GFlowNode>) {
  const { node, touchKind, touchTs, touchActive, impact, selected, dimmed, now, flashTs } = data;
  const style: CSSProperties & Record<string, string | number> = { width: node.w, height: node.h };
  if (touchKind) style['--kc'] = `var(--k-${touchKind})`;
  const ago = touchTs ? Math.max(0, now - touchTs) : 0;
  const impactClass = impact === undefined ? '' : impact === 0 ? 'impact-src' : `impact-${Math.min(impact, 4)}`;

  return (
    <div className={`gnode gnode-${node.kind} ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dim' : ''} ${impactClass}`} style={style} title={node.sub ? `${node.label} · ${node.sub}` : node.label}>
      <Handle type="target" position={Position.Top} style={HANDLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE} />
      {touchKind && (
        <>
          <span className={`touch-overlay ${touchActive ? 'live' : ''}`} style={touchActive ? undefined : { animationDelay: `-${ago}ms` }} />
          {!touchActive && ago < 4000 && <span className="touch-ring" style={{ animationDelay: `-${ago}ms` }} />}
        </>
      )}
      {impact === 0 && <span className="ripple" />}
      {flashTs !== undefined && now - flashTs < 4000 && <span className="error-flash" style={{ animationDelay: `-${Math.max(0, now - flashTs)}ms` }} />}
      <div className="relative flex h-full items-center gap-1.5 px-2">
        <NodeIcon node={node} />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-mono text-xs font-semibold">{node.label}</div>
          {node.sub && <div className="truncate text-xs text-dim">{node.sub}</div>}
        </div>
      </div>
    </div>
  );
});

// ---- edges ----------------------------------------------------------------------------------
export interface GEdgeData extends Record<string, unknown> {
  weight: number;
  weak?: boolean;
  glowKind?: Kind;
  glowTs?: number;
  trail?: boolean;
  impact?: boolean;
  dimmed?: boolean;
  now: number;
}

/** Where a line from the centre of rectangle A towards B leaves A's border. */
function borderPoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(w / 2 / Math.abs(dx || 1e-6), h / 2 / Math.abs(dy || 1e-6));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export const FloatingEdge = memo(function FloatingEdge({ id, source, target, data }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const d = data as GEdgeData;
  const sw = s.measured.width ?? 80;
  const sh = s.measured.height ?? 34;
  const tw = t.measured.width ?? 80;
  const th = t.measured.height ?? 34;
  const sc = { x: s.internals.positionAbsolute.x + sw / 2, y: s.internals.positionAbsolute.y + sh / 2 };
  const tc = { x: t.internals.positionAbsolute.x + tw / 2, y: t.internals.positionAbsolute.y + th / 2 };
  const a = borderPoint(sc.x, sc.y, sw, sh, tc.x, tc.y);
  const b = borderPoint(tc.x, tc.y, tw, th, sc.x, sc.y);

  // An arrow head at the target end.
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const size = 7;
  const head = `M ${b.x} ${b.y} L ${b.x - size * Math.cos(ang - 0.4)} ${b.y - size * Math.sin(ang - 0.4)} L ${b.x - size * Math.cos(ang + 0.4)} ${b.y - size * Math.sin(ang + 0.4)} Z`;

  const glow = d.glowKind !== undefined && d.glowTs !== undefined;
  const ago = glow ? Math.max(0, d.now - d.glowTs!) : 0;
  const style: CSSProperties & Record<string, string | number> = {};
  if (glow) style['--kc'] = `var(--k-${d.glowKind})`;
  const width = Math.min(4, 1 + Math.log2(d.weight)) + (glow || d.impact ? 0.8 : 0);

  return (
    <g className={`gedge ${glow ? 'glow' : ''} ${d.impact ? 'impacted' : ''} ${d.weak ? 'weak' : ''} ${d.trail ? 'trail' : ''} ${d.dimmed ? 'is-dim' : ''}`} style={{ ...style, animationDelay: glow ? `-${ago}ms` : undefined }}>
      <BaseEdge id={id} path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} style={{ strokeWidth: width, animationDelay: glow ? `-${ago}ms` : undefined }} />
      <path d={head} className="gedge-head" style={{ animationDelay: glow ? `-${ago}ms` : undefined }} />
    </g>
  );
});
