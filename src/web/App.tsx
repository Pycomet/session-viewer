import { useEffect, useState } from 'react';
import type { Session, SessionSummary } from '../core/model';
import { fetchSessions, subscribeSession } from './api';
import { SessionList } from './components/SessionList';

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);
  useEffect(() => (activeId ? subscribeSession(activeId, setSession) : undefined), [activeId]);
  return (
    <div className="app">
      <SessionList sessions={sessions} activeId={activeId} onSelect={setActiveId} />
      <main className="main">
        <pre style={{ padding: 12 }}>{session ? `${session.title ?? session.id}: ${session.lanes.map((l) => `${l.label} (${l.steps.length})`).join(', ')}` : 'Pick a session'}</pre>
      </main>
    </div>
  );
}
