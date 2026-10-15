import { useMemo, useState } from 'react';
import type { SessionSummary } from '../../core/model';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const base = (p: string | null) => (p ? p.split('/').filter(Boolean).pop() ?? p : 'unknown project');

export function SessionList({ sessions, activeId, onSelect }: { sessions: SessionSummary[]; activeId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return sessions.filter((s) => `${s.title ?? ''} ${s.cwd ?? ''} ${s.id}`.toLowerCase().includes(needle));
  }, [sessions, q]);
  return (
    <nav className="sidebar" aria-label="Sessions">
      <input placeholder="Filter sessions" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 && <p className="empty" style={{ padding: 12 }}>No sessions found.</p>}
      {shown.map((s) => (
        <button key={s.id} className="session-item" aria-current={s.id === activeId} onClick={() => onSelect(s.id)}>
          {s.title ?? s.id.slice(0, 8)}
          <small>{base(s.cwd)} · {ago(s.updatedAt)}</small>
        </button>
      ))}
    </nav>
  );
}
