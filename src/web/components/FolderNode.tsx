import type { NodeProps } from '@xyflow/react';
import type { FolderBox } from '../../core/model';

export function FolderNode({ data }: NodeProps) {
  const { folder, heat } = data as unknown as { folder: FolderBox; heat: number };
  return (
    <div className="folder" style={{ background: `color-mix(in srgb, var(--edit) ${Math.round(heat * 100)}%, var(--panel))` }}>
      <header>{folder.path} · {folder.touches}</header>
      <ul>
        {folder.files.map((f) => (
          <li key={f.path} title={f.path}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').pop()}</span>
            <span>
              {f.reads > 0 && <span className="badge read">read {f.reads}</span>} {f.edits > 0 && <span className="badge edit">edit {f.edits}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
