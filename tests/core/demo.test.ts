import { describe, expect, it } from 'vitest';
import { SESSION_ID_RE } from '../../src/core/discover';
import { DEMO_ID, demoSession } from '../../src/core/demo';
import { buildProjectMap } from '../../src/core/projectMap';
import { buildFlowGraph, defaultExpandedTurns, turnsOf } from '../../src/web/graph/buildFlowGraph';
import { timelineOf } from '../../src/web/graph/replay';

describe('demoSession', () => {
  const s = demoSession();

  it('uses a valid session id so layouts can be saved', () => {
    expect(SESSION_ID_RE.test(DEMO_ID)).toBe(true);
    expect(s.id).toBe(DEMO_ID);
  });

  it('has 4 turns, so exactly one starts folded', () => {
    expect(turnsOf(s)).toHaveLength(4);
    const g = buildFlowGraph(s, { expandedTurns: defaultExpandedTurns(s), expandedLanes: new Set(), fullTurns: new Set(), visible: null });
    expect(g.nodes.filter((n) => n.type === 'turn')).toHaveLength(1);
  });

  it('has a helper agent linked to an Agent step, folded by default and visible', () => {
    const helper = s.lanes.find((l) => l.id !== 'main')!;
    const parent = s.lanes[0].steps.find((st) => st.id === helper.parentStepId)!;
    expect(parent.tool?.name).toBe('Agent');
    expect(parent.spawnsLaneId).toBe(helper.id);
    const g = buildFlowGraph(s, { expandedTurns: defaultExpandedTurns(s), expandedLanes: new Set(), fullTurns: new Set(), visible: null });
    expect(g.nodes.some((n) => n.type === 'lane')).toBe(true);
  });

  it('has a visible error step in an open turn', () => {
    const g = buildFlowGraph(s, { expandedTurns: defaultExpandedTurns(s), expandedLanes: new Set(), fullTurns: new Set(), visible: null });
    expect(g.nodes.some((n) => n.type === 'step' && n.isError)).toBe(true);
  });

  it('touches at least 2 folders, with both reads and edits', () => {
    const map = buildProjectMap(s);
    expect(map.folders.length).toBeGreaterThanOrEqual(2);
    const files = map.folders.flatMap((f) => f.files);
    expect(files.some((f) => f.reads > 0)).toBe(true);
    expect(files.some((f) => f.edits > 0)).toBe(true);
  });

  it('has strictly increasing timestamps in time order, so playback reveals one step at a time', () => {
    const times = timelineOf(s).map((st) => Date.parse(st.timestamp!));
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
  });

  it('returns a fresh object each call', () => {
    expect(demoSession()).not.toBe(demoSession());
  });
});
