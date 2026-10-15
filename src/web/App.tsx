import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { FlowView } from './components/FlowView';
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
        {session ? (
          <ReactFlowProvider>
            <div className="canvas"><FlowView session={session} visible={null} onSelect={() => {}} follow={false} /></div>
          </ReactFlowProvider>
        ) : <p className="empty">Pick a session</p>}
      </main>
    </div>
  );
}
