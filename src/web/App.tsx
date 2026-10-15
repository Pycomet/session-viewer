import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import type { Session, SessionSummary, Step } from '../core/model';
import { fetchSessions, subscribeSession, type View } from './api';
import { DetailsPanel } from './components/DetailsPanel';
import { FlowView } from './components/FlowView';
import { MapView } from './components/MapView';
import { ReplayBar } from './components/ReplayBar';
import { SessionList } from './components/SessionList';
import { timelineOf, visibleUpTo } from './graph/replay';

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('flow');
  const [cursor, setCursor] = useState<number | null>(null); // null = live (show everything)
  const [selected, setSelected] = useState<Step | null>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);
  useEffect(() => {
    setSession(null);
    setCursor(null);
    setSelected(null);
    return activeId ? subscribeSession(activeId, setSession) : undefined;
  }, [activeId]);

  const timeline = useMemo(() => (session ? timelineOf(session) : []), [session]);
  const visible = useMemo(() => (cursor === null ? null : visibleUpTo(timeline, cursor)), [timeline, cursor]);

  return (
    <div className="app">
      <SessionList sessions={sessions} activeId={activeId} onSelect={setActiveId} />
      <main className="main">
        {session ? (
          <>
            <div className="toolbar">
              <strong style={{ marginRight: 'auto' }}>{session.title ?? session.id.slice(0, 8)}</strong>
              <button aria-pressed={view === 'flow'} onClick={() => setView('flow')}>Flow</button>
              <button aria-pressed={view === 'map'} onClick={() => setView('map')}>Project map</button>
              <label><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow latest</label>
            </div>
            <div className="canvas">
              <ReactFlowProvider key={`${session.id}-${view}`}>
                {view === 'flow' ? (
                  <FlowView session={session} visible={visible} onSelect={setSelected} follow={follow && cursor === null} />
                ) : (
                  <MapView session={session} visible={visible} />
                )}
              </ReactFlowProvider>
            </div>
            {selected && <DetailsPanel step={selected} onClose={() => setSelected(null)} />}
          </>
        ) : (
          <p className="empty">{activeId ? 'Loading…' : 'Pick a session on the left.'}</p>
        )}
      </main>
      {session && <ReplayBar timeline={timeline} cursor={cursor} onChange={setCursor} />}
    </div>
  );
}
