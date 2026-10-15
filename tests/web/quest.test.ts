import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../src/web/graph/buildFlowGraph';
import { FRESH_QUEST, isComplete, nextItem, onLoad, pulseNodeId, QUEST_ITEMS, questReducer, type QuestEvent } from '../../src/web/quest/quest';

const ALL_EVENTS: QuestEvent[] = ['playback-done', 'step-selected', 'turn-opened', 'lane-opened', 'error-selected', 'view-map', 'replay-moved', 'node-dragged'];
const ev = (event: QuestEvent) => ({ type: 'event' as const, event });

describe('quest rules', () => {
  it('has the 8 agreed items in order', () => {
    expect(QUEST_ITEMS.map((i) => i.id)).toEqual(['watch', 'step', 'turn', 'helper', 'error', 'map', 'rewind', 'drag']);
  });

  it('ticks the matching item for each event, in any order, ignoring duplicates', () => {
    let s = questReducer(FRESH_QUEST, { type: 'start' });
    s = questReducer(s, ev('view-map'));
    s = questReducer(s, ev('view-map'));
    expect(s.done).toEqual(['map']);
    expect(nextItem(s)?.id).toBe('watch');
    for (const e of ALL_EVENTS) s = questReducer(s, ev(e));
    expect(isComplete(s)).toBe(true);
    expect(nextItem(s)).toBeNull();
  });

  it('records events from any session and even after the card is dismissed', () => {
    let s = questReducer(questReducer(FRESH_QUEST, { type: 'start' }), { type: 'dismiss' });
    s = questReducer(s, ev('step-selected'));
    expect(s).toMatchObject({ dismissed: true, done: ['step'] });
  });

  it('reset clears everything so the tour restarts from item 1', () => {
    let s = questReducer(FRESH_QUEST, { type: 'start' });
    for (const e of ALL_EVENTS) s = questReducer(s, ev(e));
    s = questReducer(questReducer(s, { type: 'dismiss' }), { type: 'reset' });
    expect(s).toEqual(FRESH_QUEST);
  });
});

describe('onLoad', () => {
  it('first visit: open the demo and play it', () => {
    expect(onLoad(FRESH_QUEST)).toEqual({ openDemo: true, play: true });
  });

  it('reload mid-tour: reopen the demo, replay only if "watch" is not done yet', () => {
    expect(onLoad({ started: true, done: [], dismissed: false })).toEqual({ openDemo: true, play: true });
    expect(onLoad({ started: true, done: ['watch', 'step'], dismissed: false })).toEqual({ openDemo: true, play: false });
  });

  it('tour skipped or finished: leave the user alone', () => {
    expect(onLoad({ started: true, done: ['watch'], dismissed: true })).toEqual({ openDemo: false, play: false });
  });
});

const node = (id: string, type: GraphNode['type'], isError = false): GraphNode => ({ id, type, label: id, laneId: 'main', isError, count: 1, step: null });

describe('pulseNodeId', () => {
  const nodes = [node('t1', 'turn'), node('s1', 'step'), node('s2', 'step', true), node('l1', 'lane')];

  it('picks the first node matching the target', () => {
    expect(pulseNodeId(nodes, 'turn')).toBe('t1');
    expect(pulseNodeId(nodes, 'step')).toBe('s1');
    expect(pulseNodeId(nodes, 'error')).toBe('s2');
    expect(pulseNodeId(nodes, 'lane')).toBe('l1');
  });

  it('returns null when the target is not a node or is not on screen', () => {
    expect(pulseNodeId(nodes, 'map-button')).toBeNull();
    expect(pulseNodeId(nodes, null)).toBeNull();
    expect(pulseNodeId([node('t1', 'turn')], 'error')).toBeNull();
  });
});
