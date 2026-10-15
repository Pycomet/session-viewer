import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { GraphNode } from '../graph/buildFlowGraph';

const KIND_COLOR: Record<string, string> = { user: 'var(--user)', text: 'var(--text)', thinking: 'var(--thinking)', tool: 'var(--tool)', error: 'var(--error)' };

export function StepNode({ data }: NodeProps) {
  const n = data as unknown as GraphNode;
  const kind = n.step?.kind ?? (n.type === 'lane' ? 'helper' : 'turn');
  return (
    <div className={`node${n.isError ? ' error' : ''}${n.type !== 'step' ? ' folded' : ''}`} style={{ '--kind': KIND_COLOR[kind] ?? 'var(--muted)' } as CSSProperties} title={n.type === 'step' ? 'Click for details' : 'Click to expand'}>
      <Handle type="target" position={Position.Top} />
      <div className="kind">{n.type === 'step' ? kind : n.type === 'lane' ? 'helper agent (folded)' : 'turn (folded)'}</div>
      <div className="label">{n.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
