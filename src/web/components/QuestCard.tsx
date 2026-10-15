import { isComplete, nextItem, QUEST_ITEMS, type QuestState } from '../quest/quest';

export function QuestCard({ state, onSkip, onFinish }: { state: QuestState; onSkip: () => void; onFinish: () => void }) {
  const done = state.done.length;
  const total = QUEST_ITEMS.length;
  const next = nextItem(state);
  if (isComplete(state)) {
    return (
      <aside className="quest" aria-label="Tour">
        <strong>You're ready 🎉</strong>
        <p>You've tried everything Session Viewer does. Now open one of your own sessions.</p>
        <button className="quest-primary" onClick={onFinish}>Open one of my sessions</button>
      </aside>
    );
  }
  return (
    <aside className="quest" aria-label="Tour">
      <header>
        <strong>Learn Session Viewer</strong>
        <span>{done} of {total}</span>
      </header>
      <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ol>
        {QUEST_ITEMS.map((item) => {
          const ticked = state.done.includes(item.id);
          const current = item.id === next?.id;
          return (
            <li key={item.id} className={ticked ? 'ticked' : current ? 'current' : ''}>
              <span className="quest-check" aria-hidden>{ticked ? '✓' : ''}</span>
              <span>
                {item.title}
                {current && <small>{item.hint}</small>}
              </span>
            </li>
          );
        })}
      </ol>
      <button className="quest-skip" onClick={onSkip}>Skip tour</button>
    </aside>
  );
}
