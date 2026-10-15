import dagre from '@dagrejs/dagre';
import type { Positions } from '../../core/model';

export const NODE_W = 260;
export const NODE_H = 56;

export function autoLayout(nodes: { id: string }[], edges: { source: string; target: string }[]): Positions {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 36 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out: Positions = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  }
  return out;
}
