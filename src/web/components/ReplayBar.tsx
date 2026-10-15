import type { Step } from '../../core/model';

export function ReplayBar({ timeline, cursor, onChange }: { timeline: Step[]; cursor: number | null; onChange: (c: number | null) => void }) {
  const value = cursor ?? timeline.length;
  const current = timeline[value - 1];
  return (
    <div className="replay">
      <span>{cursor === null ? 'Live' : `Step ${value} / ${timeline.length}`}</span>
      <input type="range" min={0} max={timeline.length} value={value} aria-label="Replay position" onChange={(e) => {
        const v = Number(e.target.value);
        onChange(v >= timeline.length ? null : v);
      }} />
      <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current ? `${current.timestamp ? new Date(current.timestamp).toLocaleTimeString() : ''} ${current.label}` : ''}
      </span>
      {cursor !== null && <button onClick={() => onChange(null)}>Back to live</button>}
    </div>
  );
}
