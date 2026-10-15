import { Background, Controls, MiniMap, Panel, ReactFlow, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, Step } from '../../core/model';
import { autoLayout, NODE_H, NODE_W } from '../graph/autoLayout';
import { applyOverrides, buildFlowGraph, defaultExpandedTurns, type GraphNode } from '../graph/buildFlowGraph';
import { followTarget } from '../graph/follow';
import { mergePositions } from '../graph/positions';
import { pulseNodeId, type PulseTarget, type QuestEvent } from '../quest/quest';
import { useSavedLayout } from '../useSavedLayout';
import { StepNode } from './StepNode';

const nodeTypes = { sv: StepNode };
const NO_LANES = new Set<string>();

// Record a manual open/close, flipping whatever the node currently shows.
const flip = (overrides: Map<string, boolean>, id: string, isOpen: boolean) => new Map(overrides).set(id, !isOpen);

export function FlowView({ session, visible, onSelect, follow, pulse, onQuestEvent }: { session: Session; visible: Set<string> | null; onSelect: (s: Step) => void; follow: boolean; pulse: PulseTarget; onQuestEvent: (e: QuestEvent) => void }) {
  // Defaults are recomputed from the session (live) or the replay cursor; clicks are kept as overrides on top.
  const [turnOverrides, setTurnOverrides] = useState<Map<string, boolean>>(new Map());
  const [laneOverrides, setLaneOverrides] = useState<Map<string, boolean>>(new Map());
  const [fullTurns, setFullTurns] = useState<Set<string>>(new Set());
  const { saved, savePosition, reset } = useSavedLayout(session.id, 'flow');
  const { setCenter } = useReactFlow();

  const expandedTurns = useMemo(() => applyOverrides(defaultExpandedTurns(session, 3, visible), turnOverrides), [session, visible, turnOverrides]);
  const expandedLanes = useMemo(() => applyOverrides(NO_LANES, laneOverrides), [laneOverrides]);
  const graph = useMemo(() => buildFlowGraph(session, { expandedTurns, expandedLanes, fullTurns, visible }), [session, expandedTurns, expandedLanes, fullTurns, visible]);
  const positions = useMemo(() => mergePositions(autoLayout(graph.nodes, graph.edges), saved), [graph, saved]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const pulseId = pulseNodeId(graph.nodes, pulse);
  // Bring the tour's highlighted box into view once per quest item, keeping the user's zoom.
  // Keyed on the item (pulse), not the box id, so scrubbing or folding never re-centres the camera.
  const centredFor = useRef<PulseTarget>(null);
  useEffect(() => {
    if (pulse === centredFor.current) return;
    const p = pulseId ? positions[pulseId] : undefined;
    if (!p) return; // target not on screen yet; centre when it appears
    centredFor.current = pulse;
    setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { duration: 400 });
  }, [pulse, pulseId, positions, setCenter]);
  useEffect(() => {
    setNodes(graph.nodes.map((n) => ({ id: n.id, type: 'sv', position: positions[n.id], data: { ...n, pulse: n.id === pulseId } as unknown as Record<string, unknown>, width: NODE_W, height: NODE_H })));
  }, [graph, positions, pulseId, setNodes]);

  const edges: Edge[] = useMemo(
    () => graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, animated: e.kind === 'spawn', style: e.kind === 'spawn' ? { strokeDasharray: '6 4' } : undefined })),
    [graph],
  );

  const lastCentered = useRef<string | null>(null);
  const newest = graph.nodes[graph.nodes.length - 1]?.id;
  useEffect(() => {
    if (!follow) {
      lastCentered.current = null;
      return;
    }
    const target = followTarget(lastCentered.current, newest, follow);
    const p = target ? positions[target] : undefined;
    if (!target || !p) return;
    lastCentered.current = target;
    setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1, duration: 300 });
  }, [follow, newest, positions, setCenter]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => {
        savePosition(node.id, node.position);
        onQuestEvent('node-dragged');
      }}
      onNodeClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.type === 'turn') {
          setTurnOverrides((o) => flip(o, n.id, false));
          onQuestEvent('turn-opened');
        } else if (n.type === 'more') setFullTurns((s) => new Set(s).add(n.id.slice('more:'.length)));
        else if (n.type === 'lane') {
          setLaneOverrides((o) => flip(o, n.laneId, false));
          onQuestEvent('lane-opened');
        } else if (n.step) onSelect(n.step);
      }}
      onNodeDoubleClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.step?.laneId && n.step.laneId !== 'main') setLaneOverrides((o) => flip(o, n.step!.laneId, true));
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
