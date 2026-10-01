// ============================================================================
//  layout.ts: decide where each node sits. We use a "force" simulation (d3-force):
//  connected nodes pull together, all nodes push apart, so related code clusters.
//  Positions are remembered between updates so the graph doesn't jump around.
// ============================================================================
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { GEdge, GNode } from './model';

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
}

/** Push apart any two nodes whose rectangles overlap (along whichever axis needs the smaller move). */
function separate(sim: SimNode[], nodes: GNode[]) {
  const size = new Map(nodes.map((n) => [n.id, n]));
  const PAD_X = 10;
  const PAD_Y = 8;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < sim.length; i++) {
      const a = sim[i];
      const na = size.get(a.id)!;
      for (let j = i + 1; j < sim.length; j++) {
        const b = sim[j];
        const nb = size.get(b.id)!;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const ox = (na.w + nb.w) / 2 + PAD_X - Math.abs(dx);
        const oy = (na.h + nb.h) / 2 + PAD_Y - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = ox / 2 + 0.5;
          const dir = dx >= 0 ? 1 : -1;
          a.x = (a.x ?? 0) - dir * push;
          b.x = (b.x ?? 0) + dir * push;
        } else {
          const push = oy / 2 + 0.5;
          const dir = dy >= 0 ? 1 : -1;
          a.y = (a.y ?? 0) - dir * push;
          b.y = (b.y ?? 0) + dir * push;
        }
      }
    }
    if (!moved) break;
  }
}

export type Positions = Map<string, { x: number; y: number }>;

/** `aspect` = panel width / height. The graph is shaped to match, so a tall panel gets a tall graph. */
export function layoutGraph(nodes: GNode[], edges: GEdge[], prev: Positions, aspect = 1.4): Positions {
  if (nodes.length === 0) return new Map();
  const index = new Map<string, SimNode>();
  const sim: SimNode[] = nodes.map((n, i) => {
    const old = prev.get(n.id);
    // new nodes start on a spiral so they don't all begin at the same point
    const angle = i * 2.4;
    const radius = 12 * Math.sqrt(i + 1);
    const s: SimNode = { id: n.id, r: n.w / 2.35 + 3, x: old?.x ?? Math.cos(angle) * radius * 6, y: old?.y ?? Math.sin(angle) * radius * 4 };
    index.set(n.id, s);
    return s;
  });
  const links: SimulationLinkDatum<SimNode>[] = edges
    .filter((e) => index.has(e.source) && index.has(e.target))
    .map((e) => ({ source: index.get(e.source)!, target: index.get(e.target)! }));

  const reused = nodes.filter((n) => prev.has(n.id)).length / nodes.length;
  const simulation = forceSimulation(sim)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).distance(78).strength(0.6))
    .force('charge', forceManyBody<SimNode>().strength(-210).distanceMax(380))
    .force('collide', forceCollide<SimNode>((d) => d.r).iterations(2))
    // a gentle pull to the middle, a bit stronger vertically so the graph is wide rather than tall
    .force('x', forceX<SimNode>(0).strength(0.05 / Math.min(2, Math.max(0.5, aspect))))
    .force('y', forceY<SimNode>(0).strength(0.05 * Math.min(2, Math.max(0.5, aspect))))
    .stop();
  simulation.alpha(reused > 0.7 ? 0.25 : 1);
  const ticks = reused > 0.7 ? 90 : 300;
  for (let i = 0; i < ticks; i++) simulation.tick();

  // Reshape to fit the panel: stretch one axis and squeeze the other (keeping the same area), then
  // nudge apart anything that now overlaps.
  const xs = sim.map((s) => s.x ?? 0);
  const ys = sim.map((s) => s.y ?? 0);
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const h = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const sx = Math.sqrt(aspect / (w / h));
  if (sim.length > 6 && Math.abs(sx - 1) > 0.08) {
    for (const s of sim) {
      s.x = (s.x ?? 0) * sx;
      s.y = (s.y ?? 0) / sx;
    }
  }
  separate(sim, nodes);

  const out: Positions = new Map();
  for (const s of sim) out.set(s.id, { x: s.x ?? 0, y: s.y ?? 0 });
  return out;
}
