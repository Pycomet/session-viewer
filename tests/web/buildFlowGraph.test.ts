import { describe, expect, it } from 'vitest';
import type { Lane, Session, Step } from '../../src/core/model';
import { applyOverrides, buildFlowGraph, defaultExpandedTurns, TURN_CAP, turnsOf } from '../../src/web/graph/buildFlowGraph';

const step = (id: string, kind: Step['kind'], laneId = 'main', extra: Partial<Step> = {}): Step => ({
  id, laneId, index: 0, kind, timestamp: null, label: id, detail: '', isError: false, tool: null, tokens: null, spawnsLaneId: null, ...extra,
});

function session(turnCount: number, withAgent = false): Session {
  const steps: Step[] = [];
  for (let t = 0; t < turnCount; t++) steps.push(step(`u${t}`, 'user'), step(`a${t}`, 'text'));
  const lanes: Lane[] = [{ id: 'main', label: 'Main', parentStepId: null, steps }];
  if (withAgent) {
    const last = steps[steps.length - 1];
    last.spawnsLaneId = 'sub';
    lanes.push({ id: 'sub', label: 'Review', parentStepId: last.id, steps: [step('s1', 'text', 'sub'), step('s2', 'tool', 'sub', { isError: true })] });
  }
  return { id: 'x', cwd: null, title: null, lanes };
}

const opts = (s: Session, extra: Partial<Parameters<typeof buildFlowGraph>[1]> = {}) => ({
  expandedTurns: defaultExpandedTurns(s), expandedLanes: new Set<string>(), fullTurns: new Set<string>(), visible: null, ...extra,
});

describe('buildFlowGraph', () => {
  it('splits the main lane into turns at each user message', () => {
    expect(turnsOf(session(3)).map((t) => t.steps.map((s) => s.id))).toEqual([['u0', 'a0'], ['u1', 'a1'], ['u2', 'a2']]);
  });

  it('collapses all but the last 3 turns by default', () => {
    const s = session(10);
    const { nodes, edges } = buildFlowGraph(s, opts(s));
    expect(nodes.filter((n) => n.type === 'turn')).toHaveLength(7);
    expect(nodes.filter((n) => n.type === 'step')).toHaveLength(6);
    expect(nodes[0]).toMatchObject({ type: 'turn', label: 'Turn 1 · 2 steps', count: 2 });
    expect(edges.filter((e) => e.kind === 'next')).toHaveLength(nodes.length - 1);
  });

  it('folds helper lanes by default, marking errors on the folded node', () => {
    const s = session(1, true);
    const { nodes, edges } = buildFlowGraph(s, opts(s));
    expect(nodes.find((n) => n.id === 'lane:sub')).toMatchObject({ type: 'lane', label: 'Review · 2 steps', isError: true });
    expect(nodes.some((n) => n.id === 's1')).toBe(false);
    expect(edges).toContainEqual({ id: 'spawn:a0->lane:sub', source: 'a0', target: 'lane:sub', kind: 'spawn' });
  });

  it('branches an opened helper lane from its parent step and marks errors', () => {
    const s = session(1, true);
    const { nodes, edges } = buildFlowGraph(s, opts(s, { expandedLanes: new Set(['sub']) }));
    expect(edges).toContainEqual({ id: 'spawn:a0->s1', source: 'a0', target: 's1', kind: 'spawn' });
    expect(edges).toContainEqual({ id: 'next:s1->s2', source: 's1', target: 's2', kind: 'next' });
    expect(nodes.find((n) => n.id === 's2')!.isError).toBe(true);
  });

  it('hides helper lanes whose parent is inside a collapsed turn', () => {
    const s = session(1, true);
    const { nodes } = buildFlowGraph(s, opts(s, { expandedTurns: new Set() }));
    expect(nodes.map((n) => n.id)).toEqual(['turn:u0']);
  });

  it('still shows helper lanes that have no parent step (e.g. started by a skill)', () => {
    const s = session(1);
    s.lanes.push({ id: 'orphan', label: '/code-review', parentStepId: null, steps: [step('o1', 'text', 'orphan'), step('o2', 'text', 'orphan')] });
    expect(buildFlowGraph(s, opts(s)).nodes.find((n) => n.id === 'lane:orphan')).toMatchObject({ type: 'lane', label: '/code-review · 2 steps' });
    const open = buildFlowGraph(s, opts(s, { expandedLanes: new Set(['orphan']) }));
    expect(open.nodes.map((n) => n.id)).toEqual(['u0', 'a0', 'o1', 'o2']);
    expect(open.edges).toContainEqual({ id: 'next:o1->o2', source: 'o1', target: 'o2', kind: 'next' });
  });

  it(`caps a very long open turn to its last ${TURN_CAP} steps behind an "earlier steps" node`, () => {
    const steps = [step('u0', 'user'), ...Array.from({ length: TURN_CAP + 10 }, (_, i) => step(`t${i}`, 'tool'))];
    const s: Session = { id: 'x', cwd: null, title: null, lanes: [{ id: 'main', label: 'Main', parentStepId: null, steps }] };
    const capped = buildFlowGraph(s, opts(s));
    expect(capped.nodes[0]).toMatchObject({ id: 'more:turn:u0', type: 'more', label: '11 earlier steps', count: 11 });
    expect(capped.nodes).toHaveLength(TURN_CAP + 1);
    expect(capped.edges[0]).toMatchObject({ source: 'more:turn:u0', target: 't10' });
    expect(buildFlowGraph(s, opts(s, { fullTurns: new Set(['turn:u0']) })).nodes).toHaveLength(TURN_CAP + 11);
  });

  it('shows only visible steps during replay', () => {
    const s = session(2);
    const { nodes } = buildFlowGraph(s, opts(s, { visible: new Set(['u0', 'a0', 'u1']) }));
    expect(nodes.map((n) => n.id)).toEqual(['u0', 'a0', 'u1']);
  });
});

describe('defaultExpandedTurns', () => {
  it('opens the last 3 turns that have visible steps, so replay is not all folded', () => {
    const s = session(10);
    expect([...defaultExpandedTurns(s)]).toEqual(['turn:u7', 'turn:u8', 'turn:u9']);
    const visible = new Set(['u0', 'a0', 'u1', 'a1', 'u2', 'a2', 'u3']);
    expect([...defaultExpandedTurns(s, 3, visible)]).toEqual(['turn:u1', 'turn:u2', 'turn:u3']);
  });
});

describe('applyOverrides', () => {
  it('lets manual open/close win over the defaults', () => {
    const out = applyOverrides(new Set(['a', 'b']), new Map([['b', false], ['c', true]]));
    expect([...out].sort()).toEqual(['a', 'c']);
  });
});
