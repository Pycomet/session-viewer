import { describe, expect, it } from 'vitest';
import type { Session, Step } from '../../src/core/model';
import { timelineOf, visibleUpTo } from '../../src/web/graph/replay';

const s = (id: string, laneId: string, timestamp: string | null): Step => ({
  id, laneId, index: 0, kind: 'text', timestamp, label: id, detail: '', isError: false, tool: null, tokens: null, spawnsLaneId: null,
});

const session: Session = {
  id: 'x', cwd: null, title: null,
  lanes: [
    { id: 'main', label: 'Main', parentStepId: null, steps: [s('m1', 'main', '2026-10-15T10:00:00Z'), s('m2', 'main', '2026-10-15T10:00:05Z')] },
    { id: 'sub', label: 'Sub', parentStepId: 'm1', steps: [s('h1', 'sub', '2026-10-15T10:00:02Z'), s('h2', 'sub', null)] },
  ],
};

describe('replay', () => {
  it('merges lanes in time order; missing timestamps inherit the previous step in their lane', () => {
    expect(timelineOf(session).map((x) => x.id)).toEqual(['m1', 'h1', 'h2', 'm2']);
  });

  it('shows the first N steps', () => {
    const t = timelineOf(session);
    expect([...visibleUpTo(t, 2)]).toEqual(['m1', 'h1']);
    expect(visibleUpTo(t, 0).size).toBe(0);
  });
});
