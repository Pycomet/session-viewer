import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DEMO_ID, demoSession } from '../core/demo';
import type { Session, SessionSummary, Step } from '../core/model';
import { fetchSessions, subscribeSession, type View } from './api';
import { DetailsPanel } from './components/DetailsPanel';
import { FlowView } from './components/FlowView';
import { MapView } from './components/MapView';
import { QuestCard } from './components/QuestCard';
import { ReplayBar } from './components/ReplayBar';
import { SessionList } from './components/SessionList';
import { timelineOf, visibleUpTo } from './graph/replay';
import { PLAYBACK_MS, playbackCursor } from './quest/playback';
import { isComplete, nextItem, onLoad, questReducer, type QuestEvent } from './quest/quest';
import { loadQuest, saveQuest } from './quest/storage';

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('flow');
  const [cursor, setCursor] = useState<number | null>(null); // null = live (show everything)
  const [selected, setSelected] = useState<Step | null>(null);
  const [follow, setFollow] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [highlightList, setHighlightList] = useState(false);
  const [tourRun, setTourRun] = useState(0); // bumps on "?" so the views remount with their default folds
  const [quest, dispatch] = useReducer(questReducer, undefined, () => loadQuest());
  const emit = useCallback((event: QuestEvent) => dispatch({ type: 'event', event }), []);

  useEffect(() => saveQuest(quest), [quest]);
  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);

  // Page load, first run, or "?" pressed: reopen the demo for an unfinished tour, playing it if not yet watched.
  useEffect(() => {
    const { openDemo, play } = onLoad(quest);
    if (!quest.started) dispatch({ type: 'start' });
    if (!openDemo) return;
    setView('flow');
    setActiveId(DEMO_ID);
    setPlaying(play);
    // Only on load and when the tour restarts (started flips back to false); not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.started]);

  useEffect(() => {
    setSession(null);
    setCursor(null);
    setSelected(null);
    if (!activeId) return;
    setHighlightList(false);
    if (activeId === DEMO_ID) {
      setSession(demoSession());
      return;
    }
    return subscribeSession(activeId, setSession);
  }, [activeId]);

  const timeline = useMemo(() => (session ? timelineOf(session) : []), [session]);
  const visible = useMemo(() => (cursor === null ? null : visibleUpTo(timeline, cursor)), [timeline, cursor]);

  // Demo playback drives the replay cursor from a timer until it finishes or the user takes over.
  const playStart = useRef(0);
  useEffect(() => {
    if (!playing || !session) return;
    playStart.current = Date.now();
    setCursor(0);
    const timer = setInterval(() => {
      const next = playbackCursor(Date.now() - playStart.current, timeline.length, PLAYBACK_MS);
      setCursor(next);
      if (next === null) {
        setPlaying(false);
        emit('playback-done');
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing, session, timeline.length, emit]);

  // Stopping playback lives in this click handler, not the activeId effect: on first load that effect runs with
  // activeId still null in the same commit that starts playback, and would cancel it immediately.
  const selectSession = (id: string) => {
    if (id !== DEMO_ID) setPlaying(false);
    setActiveId(id);
  };
  const restartTour = () => {
    setSelected(null);
    setHighlightList(false);
    setTourRun((n) => n + 1);
    dispatch({ type: 'reset' });
  };
  const onReplayChange = (c: number | null) => {
    setPlaying(false);
    setCursor(c);
    emit(c === null ? 'playback-done' : 'replay-moved');
  };
  const onSelectStep = (s: Step) => {
    setSelected(s);
    emit('step-selected');
    if (s.isError) emit('error-selected');
  };
  const showMap = () => {
    setView('map');
    emit('view-map');
  };

  const questOpen = quest.started && !quest.dismissed;
  const pulse = questOpen && !isComplete(quest) && !playing ? nextItem(quest)?.pulse ?? null : null;

  return (
    <div className="app">
      <SessionList sessions={sessions} activeId={activeId} onSelect={selectSession} onTour={restartTour} highlight={highlightList} />
      <main className="main">
        {session ? (
          <>
            <div className="toolbar">
              <strong style={{ marginRight: 'auto' }}>{session.title ?? session.id.slice(0, 8)}</strong>
              <button aria-pressed={view === 'flow'} onClick={() => setView('flow')}>Flow</button>
              <button aria-pressed={view === 'map'} className={pulse === 'map-button' ? 'pulse' : ''} onClick={showMap}>Project map</button>
              <label><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow latest</label>
            </div>
            <div className="canvas">
              <ReactFlowProvider key={`${session.id}-${view}-${tourRun}`}>
                {view === 'flow' ? (
                  <FlowView session={session} visible={visible} onSelect={onSelectStep} follow={follow && (cursor === null || playing)} pulse={pulse} onQuestEvent={emit} />
                ) : (
                  <MapView session={session} visible={visible} onQuestEvent={emit} />
                )}
              </ReactFlowProvider>
            </div>
            {selected && <DetailsPanel step={selected} onClose={() => setSelected(null)} />}
          </>
        ) : (
          <p className="empty">{activeId ? 'Loading…' : 'Pick a session on the left.'}</p>
        )}
        {questOpen && (
          <QuestCard
            state={quest}
            onSkip={() => {
              if (playing) setCursor(null); // don't leave the demo frozen half-way through
              setPlaying(false);
              dispatch({ type: 'dismiss' });
            }}
            onFinish={() => {
              dispatch({ type: 'dismiss' });
              setActiveId(null);
              setHighlightList(true);
            }}
          />
        )}
      </main>
      {session && <ReplayBar timeline={timeline} cursor={cursor} onChange={onReplayChange} playing={playing} pulse={pulse === 'replay'} />}
    </div>
  );
}
