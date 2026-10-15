import { Background, Controls, Panel, ReactFlow, useNodesState, type Node } from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import type { Session } from '../../core/model';
import { buildProjectMap } from '../../core/projectMap';
import { folderHeight, FOLDER_W, heat, mapLayout } from '../graph/mapLayout';
import { mergePositions } from '../graph/positions';
import { useSavedLayout } from '../useSavedLayout';
import { FolderNode } from './FolderNode';

const nodeTypes = { folder: FolderNode };

export function MapView({ session, visible }: { session: Session; visible: Set<string> | null }) {
  const map = useMemo(() => buildProjectMap(session, visible), [session, visible]);
  const { saved, savePosition, reset } = useSavedLayout(session.id, 'map');
  const positions = useMemo(() => mergePositions(mapLayout(map), saved), [map, saved]);
  const max = map.folders[0]?.touches ?? 0;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(map.folders.map((f) => ({ id: f.path, type: 'folder', position: positions[f.path], data: { folder: f, heat: heat(f.touches, max) }, width: FOLDER_W, height: folderHeight(f.files.length) })));
  }, [map, positions, max, setNodes]);

  if (map.folders.length === 0) return <p className="empty">No files read or edited yet.</p>;
  return (
    <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeDragStop={(_, n) => savePosition(n.id, n.position)} fitView minZoom={0.1}>
      <Background />
      <Controls />
      <Panel position="top-right">
        <button onClick={reset}>Reset layout</button>
      </Panel>
    </ReactFlow>
  );
}
