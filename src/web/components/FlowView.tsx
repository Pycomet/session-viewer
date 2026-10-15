import { Background, Controls, MiniMap, Panel, ReactFlow, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, Step } from '../../core/model';
import { autoLayout, NODE_H, NODE_W } from '../graph/autoLayout';
import { buildFlowGraph, defaultExpandedTurns, turnsOf, type GraphNode } from '../graph/buildFlowGraph';
import { mergePositions } from '../graph/positions';
import { useSavedLayout } from '../useSavedLayout';
import { StepNode } from './StepNode';

const nodeTypes = { sv: StepNode };
const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export function FlowView({ session, visible, onSelect, follow }: { session: Session; visible: Set<string> | null; onSelect: (s: Step) => void; follow: boolean }) {
  const [expandedTurns, setExpandedTurns] = useState(() => defaultExpandedTurns(session));
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const { saved, savePosition, reset } = useSavedLayout(session.id, 'flow');
  const { setCenter } = useReactFlow();

  // Keep newly arriving turns open while live, without re-opening ones the user folded.
  const lastTurnCount = useRef(0);
  useEffect(() => {
    const count = turnsOf(session).length;
    if (lastTurnCount.current > 0 && count > lastTurnCount.current) {
      const latest = defaultExpandedTurns(session, 1);
      setExpandedTurns((prev) => new Set([...prev, ...latest]));
    }
    lastTurnCount.current = count;
  }, [session]);

  const graph = useMemo(() => buildFlowGraph(session, { expandedTurns, collapsedLanes, visible }), [session, expandedTurns, collapsedLanes, visible]);
  const positions = useMemo(() => mergePositions(autoLayout(graph.nodes, graph.edges), saved), [graph, saved]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(graph.nodes.map((n) => ({ id: n.id, type: 'sv', position: positions[n.id], data: n as unknown as Record<string, unknown>, width: NODE_W, height: NODE_H })));
  }, [graph, positions, setNodes]);

  const edges: Edge[] = useMemo(
    () => graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, animated: e.kind === 'spawn', style: e.kind === 'spawn' ? { strokeDasharray: '6 4' } : undefined })),
    [graph],
  );

  const lastId = graph.nodes[graph.nodes.length - 1]?.id;
  useEffect(() => {
    if (!follow || !lastId || !positions[lastId]) return;
    const p = positions[lastId];
    setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1, duration: 300 });
  }, [follow, lastId, positions, setCenter]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => savePosition(node.id, node.position)}
      onNodeClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.type === 'turn') setExpandedTurns((s) => toggle(s, n.id));
        else if (n.type === 'lane') setCollapsedLanes((s) => toggle(s, n.laneId));
        else if (n.step) onSelect(n.step);
      }}
      onNodeDoubleClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.step?.laneId && n.step.laneId !== 'main') setCollapsedLanes((s) => toggle(s, n.step!.laneId));
      }}
      fitView
      minZoom={0.1}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
      <Panel position="top-right">
        <button onClick={reset}>Reset layout</button>
      </Panel>
    </ReactFlow>
  );
}
