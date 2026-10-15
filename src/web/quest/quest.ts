import type { GraphNode } from '../graph/buildFlowGraph';

export type QuestItemId = 'watch' | 'step' | 'turn' | 'helper' | 'error' | 'map' | 'rewind' | 'drag';
export type PulseTarget = 'replay' | 'step' | 'turn' | 'lane' | 'error' | 'map-button' | null;

export interface QuestItem {
  id: QuestItemId;
  title: string;
  hint: string;
  pulse: PulseTarget;
}

export const QUEST_ITEMS: QuestItem[] = [
  { id: 'watch', title: 'Watch Claude work', hint: 'This is what a live session looks like: steps appear as they happen.', pulse: 'replay' },
  { id: 'step', title: 'Click a step to see what Claude did', hint: 'Every box is one step. Click one to see the full command and result.', pulse: 'step' },
  { id: 'turn', title: 'Open a folded turn', hint: 'Older parts of the chat fold into one dashed box. Click it to open.', pulse: 'turn' },
  { id: 'helper', title: 'Open a helper agent', hint: 'Claude can hand work to helper agents. Click the dashed helper box.', pulse: 'lane' },
  { id: 'error', title: 'Find the error', hint: 'Red boxes are steps that failed. Click one to see why.', pulse: 'error' },
  { id: 'map', title: 'See where Claude worked', hint: 'The Project map shows which files were read and edited.', pulse: 'map-button' },
  { id: 'rewind', title: 'Rewind time', hint: 'Drag the slider at the bottom to see the session at any moment.', pulse: 'replay' },
  { id: 'drag', title: 'Arrange it your way', hint: 'Drag any box. Your layout is saved for next time.', pulse: null },
];

export type QuestEvent =
  | 'playback-done'
  | 'step-selected'
  | 'turn-opened'
  | 'lane-opened'
  | 'error-selected'
  | 'view-map'
  | 'replay-moved'
  | 'node-dragged';

const EVENT_ITEM: Record<QuestEvent, QuestItemId> = {
  'playback-done': 'watch',
  'step-selected': 'step',
  'turn-opened': 'turn',
  'lane-opened': 'helper',
  'error-selected': 'error',
  'view-map': 'map',
  'replay-moved': 'rewind',
  'node-dragged': 'drag',
};

export interface QuestState {
  started: boolean;
  done: QuestItemId[];
  dismissed: boolean;
}

export const FRESH_QUEST: QuestState = { started: false, done: [], dismissed: false };

export type QuestAction = { type: 'event'; event: QuestEvent } | { type: 'start' } | { type: 'dismiss' } | { type: 'reset' };

export function questReducer(state: QuestState, action: QuestAction): QuestState {
  switch (action.type) {
    case 'start':
      return { ...state, started: true };
    case 'dismiss':
      return { ...state, dismissed: true };
    case 'reset':
      return FRESH_QUEST;
    case 'event': {
      const id = EVENT_ITEM[action.event];
      return state.done.includes(id) ? state : { ...state, done: [...state.done, id] };
    }
  }
}

export const nextItem = (state: QuestState): QuestItem | null => QUEST_ITEMS.find((i) => !state.done.includes(i.id)) ?? null;

export const isComplete = (state: QuestState) => QUEST_ITEMS.every((i) => state.done.includes(i.id));

// The flow-view node that should pulse for this target, or null if none is on screen.
export function pulseNodeId(nodes: GraphNode[], target: PulseTarget): string | null {
  const match: Partial<Record<NonNullable<PulseTarget>, (n: GraphNode) => boolean>> = {
    step: (n) => n.type === 'step',
    turn: (n) => n.type === 'turn',
    lane: (n) => n.type === 'lane',
    error: (n) => n.type === 'step' && n.isError,
  };
  const test = target ? match[target] : undefined;
  return (test && nodes.find(test)?.id) || null;
}
