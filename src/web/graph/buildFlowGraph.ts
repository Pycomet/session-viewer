import { MAIN_LANE, type Lane, type Session, type Step } from '../../core/model';

export interface GraphNode {
  id: string;
  type: 'step' | 'turn' | 'lane' | 'more';
  label: string;
  laneId: string;
  isError: boolean;
  count: number;
  step: Step | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'next' | 'spawn';
}

export interface FlowOptions {
  expandedTurns: Set<string>;
  expandedLanes: Set<string>; // helper lanes are folded unless listed here
  fullTurns: Set<string>; // open turns longer than TURN_CAP show every step only if listed here
  visible: Set<string> | null;
}

// An open turn shows at most this many of its latest steps; earlier ones fold into one "more" node.
export const TURN_CAP = 40;

const plural = (n: number) => `${n} step${n === 1 ? '' : 's'}`;

export function turnsOf(session: Session): { id: string; steps: Step[] }[] {
  const main = session.lanes.find((l) => l.id === MAIN_LANE)?.steps ?? [];
  const turns: { id: string; steps: Step[] }[] = [];
  for (const s of main) {
    if (s.kind === 'user' || turns.length === 0) turns.push({ id: `turn:${s.id}`, steps: [] });
    turns[turns.length - 1].steps.push(s);
  }
  return turns;
}

// The last n turns that have something to show (all turns when live, the ones up to the cursor in replay).
export function defaultExpandedTurns(session: Session, n = 3, visible: Set<string> | null = null): Set<string> {
  const shown = turnsOf(session).filter((t) => !visible || t.steps.some((s) => visible.has(s.id)));
  return new Set(shown.slice(-n).map((t) => t.id));
}

// Manual open (true) / close (false) clicks win over the defaults.
export function applyOverrides(defaults: Set<string>, overrides: Map<string, boolean>): Set<string> {
  const out = new Set(defaults);
  for (const [id, open] of overrides) {
    if (open) out.add(id);
    else out.delete(id);
  }
  return out;
}

export function buildFlowGraph(session: Session, opts: FlowOptions): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const isVisible = (s: Step) => !opts.visible || opts.visible.has(s.id);
  const stepNode = (s: Step): GraphNode => ({ id: s.id, type: 'step', label: s.label, laneId: s.laneId, isError: s.isError, count: 1, step: s });
  const chain = (ids: string[]) => {
    for (let i = 1; i < ids.length; i++) edges.push({ id: `next:${ids[i - 1]}->${ids[i]}`, source: ids[i - 1], target: ids[i], kind: 'next' });
  };
  const lanesByParent = new Map<string, Lane[]>();
  for (const lane of session.lanes) {
    if (lane.parentStepId) lanesByParent.set(lane.parentStepId, [...(lanesByParent.get(lane.parentStepId) ?? []), lane]);
  }

  const expandedSteps: Step[] = [];
  const mainIds: string[] = [];
  turnsOf(session).forEach((turn, i) => {
    let steps = turn.steps.filter(isVisible);
    if (steps.length === 0) return;
    if (!opts.expandedTurns.has(turn.id)) {
      nodes.push({ id: turn.id, type: 'turn', label: `Turn ${i + 1} · ${plural(steps.length)}`, laneId: MAIN_LANE, isError: steps.some((s) => s.isError), count: steps.length, step: null });
      mainIds.push(turn.id);
      return;
    }
    if (steps.length > TURN_CAP && !opts.fullTurns.has(turn.id)) {
      const hidden = steps.slice(0, steps.length - TURN_CAP);
      const id = `more:${turn.id}`;
      nodes.push({ id, type: 'more', label: `${hidden.length} earlier ${hidden.length === 1 ? 'step' : 'steps'}`, laneId: MAIN_LANE, isError: hidden.some((s) => s.isError), count: hidden.length, step: null });
      mainIds.push(id);
      steps = steps.slice(-TURN_CAP);
    }
    for (const s of steps) {
      nodes.push(stepNode(s));
      mainIds.push(s.id);
      expandedSteps.push(s);
    }
  });
  chain(mainIds);

  // parentId is null for helpers with no parent step (e.g. started by a skill): drawn as a standalone branch.
  const addLane = (lane: Lane, parentId: string | null) => {
    const steps = lane.steps.filter(isVisible);
    if (steps.length === 0) return;
    const spawn = (target: string) => {
      if (parentId) edges.push({ id: `spawn:${parentId}->${target}`, source: parentId, target, kind: 'spawn' });
    };
    if (!opts.expandedLanes.has(lane.id)) {
      const id = `lane:${lane.id}`;
      nodes.push({ id, type: 'lane', label: `${lane.label} · ${plural(steps.length)}`, laneId: lane.id, isError: steps.some((s) => s.isError), count: steps.length, step: null });
      spawn(id);
      return;
    }
    spawn(steps[0].id);
    for (const s of steps) nodes.push(stepNode(s));
    chain(steps.map((s) => s.id));
    steps.forEach(addLanes); // helpers started by helpers
  };
  const addLanes = (parent: Step) => {
    for (const lane of lanesByParent.get(parent.id) ?? []) addLane(lane, parent.id);
  };
  expandedSteps.forEach(addLanes);
  for (const lane of session.lanes) {
    if (lane.id !== MAIN_LANE && !lane.parentStepId) addLane(lane, null);
  }

  return { nodes, edges };
}
