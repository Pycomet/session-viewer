# First-Run Quest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On first open, Session Viewer plays a built-in demo session like a live session, then a light quest card teaches its 8 main features by ticking them off as the user does them.

**Architecture:** A UI-free `demoSession()` in `src/core/demo.ts` supplies the demo. Pure modules in `src/web/quest/` hold the rules (`quest.ts`), browser memory (`storage.ts`) and playback timing (`playback.ts`). `App.tsx` owns quest state through `useReducer`, drives playback through the existing replay cursor, and passes a `pulse` target and an `onQuestEvent` callback into the existing views. `QuestCard.tsx` renders the checklist. The server is unchanged.

**Tech Stack:** Existing stack only (React 18, @xyflow/react, Vitest, TypeScript 7). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-first-run-quest-design.md` (background: `docs/PRD.md`).

## Global Constraints

- 8 quest items, ids in this order: `watch`, `step`, `turn`, `helper`, `error`, `map`, `rewind`, `drag`.
- `DEMO_ID = '00000000-0000-4000-8000-000000000001'` (must match `SESSION_ID_RE` so layout saving works).
- Playback duration: 15 000 ms, timer tick 100 ms.
- localStorage key: `sv.quest.v1`; every access is wrapped in try/catch.
- Animations are disabled under `prefers-reduced-motion: reduce` (static outline instead).
- No server changes, no new dependencies, no XP/badges/sounds/confetti.
- `src/core/demo.ts` must have no `node:` imports (bundled into the browser).

## Review Focus

1. **Storage blocked or corrupt** (private window, hand-edited JSON): the quest still runs for the visit and nothing crashes (pinned in Task 2, `storage` tests).
2. **User interrupts playback** by dragging the slider or opening another session: playback stops and never overwrites their cursor again (pinned in Task 2, `playbackCursor` tests; the wiring is checked in the Task 4 browser check).
3. **"?" pressed after finishing or skipping:** the quest restarts cleanly from item 1 with the demo playing (pinned in Task 2, reducer `reset` test; browser check in Task 4).
4. **The pulse target isn't on screen** (e.g. no red step visible because its turn is folded): no pulse is shown and nothing crashes (pinned in Task 2, `pulseNodeId` test).
5. **Quest events from the user's own sessions:** they still count, so a user who explores elsewhere first isn't asked to redo things (pinned in Task 2, reducer test).

---

## File Structure

```
src/core/demo.ts                    # DEMO_ID + demoSession(): the made-up session
src/web/quest/quest.ts              # items, events, reducer, nextItem, isComplete, pulseNodeId
src/web/quest/storage.ts            # loadQuest / saveQuest (localStorage, safe)
src/web/quest/playback.ts           # playbackCursor
src/web/components/QuestCard.tsx    # the checklist card
modified: App.tsx, FlowView.tsx, MapView.tsx, ReplayBar.tsx, SessionList.tsx, StepNode.tsx, styles.css
tests/core/demo.test.ts, tests/web/quest.test.ts, tests/web/questStorage.test.ts, tests/web/playback.test.ts
```

---

## Task 1: Demo session

**Files:**
- Create: `src/core/demo.ts`
- Test: `tests/core/demo.test.ts`

**Interfaces:**
- Consumes: `Session`, `Step`, `StepKind`, `MAIN_LANE` (`src/core/model.ts`); `buildProjectMap` (`src/core/projectMap.ts`); `buildFlowGraph`, `defaultExpandedTurns`, `turnsOf` (`src/web/graph/buildFlowGraph.ts`); `timelineOf` (`src/web/graph/replay.ts`).
- Produces: `DEMO_ID: string`, `DEMO_TITLE: string`, `demoSession(): Session`.

- [ ] **Step 1: Write the failing test**

`tests/core/demo.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/demo.test.ts`
Expected: FAIL, `Cannot find module '../../src/core/demo'`.

- [ ] **Step 3: Implement**

`src/core/demo.ts`:
```ts
import { MAIN_LANE, type Session, type Step, type StepKind } from './model';

// A made-up session bundled with the tool for the first-run quest. No Node imports: used in the browser.
export const DEMO_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_TITLE = 'Demo: add due dates to a todo app';

const CWD = '/demo/todo-app';
const T0 = Date.UTC(2026, 9, 15, 9, 0, 0);
const ARG_KEY: Record<string, string> = { Read: 'file_path', Edit: 'file_path', Write: 'file_path', Bash: 'command', Agent: 'description' };

interface Spec {
  kind: StepKind;
  text: string; // message text, or the tool's main argument
  tool?: string;
  result?: string;
  error?: boolean;
}

const path = (rel: string) => `${CWD}/${rel}`;

function steps(laneId: string, startSec: number, stepSec: number, specs: Spec[]): Step[] {
  return specs.map((s, i) => {
    const input = s.tool ? { [ARG_KEY[s.tool]]: s.text } : {};
    return {
      id: `demo-${laneId}-${i}`,
      laneId,
      index: i,
      kind: s.kind,
      timestamp: new Date(T0 + (startSec + i * stepSec) * 1000).toISOString(),
      label: s.tool ? `${s.tool}: ${s.text}` : s.text,
      detail: s.tool ? JSON.stringify(input, null, 2) : s.text,
      isError: s.error ?? false,
      tool: s.tool ? { name: s.tool, useId: `demo-tu-${laneId}-${i}`, input, result: s.result ?? null } : null,
      tokens: null,
      spawnsLaneId: null,
    };
  });
}

export function demoSession(): Session {
  const main = steps(MAIN_LANE, 0, 4, [
    { kind: 'user', text: 'Add a due date to todos, and make sure the tests pass.' },
    { kind: 'thinking', text: 'Let me look at how todos are stored before changing anything.' },
    { kind: 'tool', tool: 'Read', text: path('src/models/todo.ts'), result: 'export interface Todo { id: string; title: string; done: boolean }' },
    { kind: 'tool', tool: 'Read', text: path('src/routes/todos.ts'), result: 'router.post("/todos", (req, res) => { ... })' },
    { kind: 'text', text: 'Todos have a title and a done flag. I will add an optional dueDate.' },
    { kind: 'user', text: 'Go ahead.' },
    { kind: 'tool', tool: 'Edit', text: path('src/models/todo.ts'), result: 'Added dueDate?: string' },
    { kind: 'tool', tool: 'Edit', text: path('src/routes/todos.ts'), result: 'Parse dueDate from the request body' },
    { kind: 'tool', tool: 'Bash', text: 'npm test', error: true, result: 'FAIL tests/todos.test.ts > rejects bad dates\n  Expected status 400, received 500' },
    { kind: 'thinking', text: 'The route throws on an invalid date instead of answering 400. I need to validate it first.' },
    { kind: 'tool', tool: 'Edit', text: path('src/routes/todos.ts'), result: 'Return 400 when dueDate is not a valid date' },
    { kind: 'tool', tool: 'Bash', text: 'npm test', result: 'Tests: 12 passed, 12 total' },
    { kind: 'user', text: 'Can you get a second opinion before we finish?' },
    { kind: 'tool', tool: 'Agent', text: 'Review the due-date change', result: 'Looks good. Consider a test for due dates in the past.' },
    { kind: 'text', text: 'The reviewer suggests one more test for past dates. Adding it.' },
    { kind: 'tool', tool: 'Write', text: path('tests/due-date.test.ts'), result: 'Created tests/due-date.test.ts' },
    { kind: 'tool', tool: 'Bash', text: 'npm test', result: 'Tests: 13 passed, 13 total' },
    { kind: 'user', text: 'Thanks! Summarise what changed.' },
    { kind: 'text', text: 'Added an optional dueDate to todos, returned 400 for invalid dates, and added a test for past dates. All 13 tests pass.' },
  ]);

  const parent = main[13];
  const helper = steps('reviewer', 13 * 4 + 1, 1, [
    { kind: 'tool', tool: 'Read', text: path('src/routes/todos.ts'), result: 'router.post("/todos", ...)' },
    { kind: 'tool', tool: 'Read', text: path('tests/todos.test.ts'), result: 'describe("todos", ...)' },
    { kind: 'text', text: 'Looks good. Consider a test for due dates in the past.' },
  ]);
  parent.spawnsLaneId = 'reviewer';

  return {
    id: DEMO_ID,
    cwd: CWD,
    title: DEMO_TITLE,
    lanes: [
      { id: MAIN_LANE, label: 'Main', parentStepId: null, steps: main },
      { id: 'reviewer', label: 'Review the due-date change', parentStepId: parent.id, steps: helper },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass (52 existing + 7 new), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/demo.ts tests/core/demo.test.ts
git commit -m "feat(core): built-in demo session for the first-run quest"
```

---

## Task 2: Quest rules, memory and playback (pure)

**Files:**
- Create: `src/web/quest/quest.ts`, `src/web/quest/storage.ts`, `src/web/quest/playback.ts`
- Test: `tests/web/quest.test.ts`, `tests/web/questStorage.test.ts`, `tests/web/playback.test.ts`

**Interfaces:**
- Consumes: `GraphNode` (type, `src/web/graph/buildFlowGraph.ts`).
- Produces:
  - `QuestItemId`, `PulseTarget = 'replay' | 'step' | 'turn' | 'lane' | 'error' | 'map-button' | null`, `QuestItem { id; title; hint; pulse }`, `QUEST_ITEMS`, `QuestEvent`, `QuestState { started; done; dismissed }`, `FRESH_QUEST`, `QuestAction`, `questReducer(state, action): QuestState`, `nextItem(state): QuestItem | null`, `isComplete(state): boolean`, `pulseNodeId(nodes: GraphNode[], target: PulseTarget): string | null`
  - `QuestStore = Pick<Storage, 'getItem' | 'setItem'>`, `loadQuest(store?): QuestState`, `saveQuest(state, store?): void`, `QUEST_KEY = 'sv.quest.v1'`
  - `PLAYBACK_MS = 15000`, `playbackCursor(elapsedMs, total, durationMs?): number | null`

- [ ] **Step 1: Write the failing tests**

`tests/web/quest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../src/web/graph/buildFlowGraph';
import { FRESH_QUEST, isComplete, nextItem, pulseNodeId, QUEST_ITEMS, questReducer, type QuestEvent } from '../../src/web/quest/quest';

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
```

`tests/web/questStorage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FRESH_QUEST } from '../../src/web/quest/quest';
import { loadQuest, QUEST_KEY, saveQuest, type QuestStore } from '../../src/web/quest/storage';

const memory = (): QuestStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('quest storage', () => {
  it('round-trips state', () => {
    const store = memory();
    saveQuest({ started: true, done: ['map', 'step'], dismissed: false }, store);
    expect(loadQuest(store)).toEqual({ started: true, done: ['map', 'step'], dismissed: false });
  });

  it('gives a fresh state for missing, corrupt or wrongly shaped data', () => {
    const store = memory();
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
    store.data.set(QUEST_KEY, '{oops');
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
    store.data.set(QUEST_KEY, JSON.stringify({ started: 'yes', done: 'all' }));
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
  });

  it('drops unknown item ids', () => {
    const store = memory();
    store.data.set(QUEST_KEY, JSON.stringify({ started: true, done: ['map', 'fly'], dismissed: false }));
    expect(loadQuest(store).done).toEqual(['map']);
  });

  it('survives a storage that throws (blocked in a private window)', () => {
    const angry: QuestStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadQuest(angry)).toEqual(FRESH_QUEST);
    expect(() => saveQuest(FRESH_QUEST, angry)).not.toThrow();
    expect(loadQuest(null)).toEqual(FRESH_QUEST);
  });
});
```

`tests/web/playback.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { playbackCursor } from '../../src/web/quest/playback';

describe('playbackCursor', () => {
  it('starts at 0, grows evenly, and ends (null) at the duration', () => {
    expect(playbackCursor(0, 20, 10000)).toBe(0);
    expect(playbackCursor(5000, 20, 10000)).toBe(10);
    expect(playbackCursor(9999, 20, 10000)).toBe(19);
    expect(playbackCursor(10000, 20, 10000)).toBeNull();
    expect(playbackCursor(99999, 20, 10000)).toBeNull();
  });

  it('is safe with no steps or a negative clock', () => {
    expect(playbackCursor(100, 0, 10000)).toBeNull();
    expect(playbackCursor(-50, 20, 10000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/web/quest.test.ts tests/web/questStorage.test.ts tests/web/playback.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/web/quest/quest.ts`:
```ts
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
```

`src/web/quest/storage.ts`:
```ts
import { FRESH_QUEST, QUEST_ITEMS, type QuestItemId, type QuestState } from './quest';

export const QUEST_KEY = 'sv.quest.v1';
export type QuestStore = Pick<Storage, 'getItem' | 'setItem'>;

const IDS = new Set<string>(QUEST_ITEMS.map((i) => i.id));

function browserStore(): QuestStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadQuest(store: QuestStore | null = browserStore()): QuestState {
  try {
    const raw = store?.getItem(QUEST_KEY);
    if (!raw) return FRESH_QUEST;
    const v = JSON.parse(raw);
    if (typeof v?.started !== 'boolean' || typeof v?.dismissed !== 'boolean' || !Array.isArray(v?.done)) return FRESH_QUEST;
    return { started: v.started, dismissed: v.dismissed, done: v.done.filter((id: unknown): id is QuestItemId => typeof id === 'string' && IDS.has(id)) };
  } catch {
    return FRESH_QUEST;
  }
}

export function saveQuest(state: QuestState, store: QuestStore | null = browserStore()): void {
  try {
    store?.setItem(QUEST_KEY, JSON.stringify(state));
  } catch {
    /* blocked storage: the quest just won't be remembered */
  }
}
```

`src/web/quest/playback.ts`:
```ts
export const PLAYBACK_MS = 15_000;

// How many steps the demo playback shows after elapsedMs, or null once it has finished.
export function playbackCursor(elapsedMs: number, total: number, durationMs = PLAYBACK_MS): number | null {
  if (total <= 0 || elapsedMs >= durationMs) return null;
  return Math.floor((Math.max(0, elapsedMs) / durationMs) * total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/web/quest tests/web/quest.test.ts tests/web/questStorage.test.ts tests/web/playback.test.ts
git commit -m "feat(web): quest rules, storage and demo playback timing"
```

---

## Task 3: Quest card and wiring

**Files:**
- Create: `src/web/components/QuestCard.tsx`
- Modify (full replacements below): `src/web/App.tsx`, `src/web/components/FlowView.tsx`, `src/web/components/MapView.tsx`, `src/web/components/ReplayBar.tsx`, `src/web/components/SessionList.tsx`, `src/web/components/StepNode.tsx`
- Modify: `src/web/styles.css` (append)

**Interfaces:**
- Consumes: everything from Tasks 1–2; existing `FlowView`, `MapView`, `ReplayBar`, `SessionList`, `DetailsPanel`, `timelineOf`, `visibleUpTo`, `subscribeSession`, `fetchSessions`.
- Produces: `<QuestCard state onSkip onFinish />`; new props `FlowView.pulse`, `FlowView.onQuestEvent`, `MapView.onQuestEvent`, `ReplayBar.playing`, `ReplayBar.pulse`, `SessionList.onTour`, `SessionList.highlight`.

- [ ] **Step 1: Quest card**

`src/web/components/QuestCard.tsx`:
```tsx
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
```

- [ ] **Step 2: StepNode shows a pulse**

Replace `src/web/components/StepNode.tsx`:
```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { GraphNode } from '../graph/buildFlowGraph';

const KIND_COLOR: Record<string, string> = { user: 'var(--user)', text: 'var(--text)', thinking: 'var(--thinking)', tool: 'var(--tool)', error: 'var(--error)' };

export function StepNode({ data }: NodeProps) {
  const n = data as unknown as GraphNode & { pulse?: boolean };
  const kind = n.step?.kind ?? (n.type === 'lane' ? 'helper' : 'turn');
  const classes = ['node', n.isError && 'error', n.type !== 'step' && 'folded', n.pulse && 'pulse'].filter(Boolean).join(' ');
  return (
    <div className={classes} style={{ '--kind': KIND_COLOR[kind] ?? 'var(--muted)' } as CSSProperties} title={n.type === 'step' ? 'Click for details' : 'Click to expand'}>
      <Handle type="target" position={Position.Top} />
      <div className="kind">{n.type === 'step' ? kind : n.type === 'lane' ? 'helper agent (folded)' : n.type === 'more' ? 'click to show' : 'turn (folded)'}</div>
      <div className="label">{n.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

- [ ] **Step 3: FlowView emits quest events and marks the pulse node**

In `src/web/components/FlowView.tsx`:
1. Add imports: `import { pulseNodeId, type PulseTarget, type QuestEvent } from '../quest/quest';`
2. Change the signature to:
```tsx
export function FlowView({ session, visible, onSelect, follow, pulse, onQuestEvent }: { session: Session; visible: Set<string> | null; onSelect: (s: Step) => void; follow: boolean; pulse: PulseTarget; onQuestEvent: (e: QuestEvent) => void }) {
```
3. Replace the `setNodes` effect with:
```tsx
  const pulseId = pulseNodeId(graph.nodes, pulse);
  useEffect(() => {
    setNodes(graph.nodes.map((n) => ({ id: n.id, type: 'sv', position: positions[n.id], data: { ...n, pulse: n.id === pulseId } as unknown as Record<string, unknown>, width: NODE_W, height: NODE_H })));
  }, [graph, positions, pulseId, setNodes]);
```
4. Replace `onNodeDragStop` and `onNodeClick` with:
```tsx
      onNodeDragStop={(_, node) => {
        savePosition(node.id, node.position);
        onQuestEvent('node-dragged');
      }}
      onNodeClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.type === 'turn') {
          setTurnOverrides((o) => flip(o, n.id, false));
          onQuestEvent('turn-opened');
        } else if (n.type === 'more') setFullTurns((s) => new Set(s).add(n.id.slice('more:'.length)));
        else if (n.type === 'lane') {
          setLaneOverrides((o) => flip(o, n.laneId, false));
          onQuestEvent('lane-opened');
        } else if (n.step) onSelect(n.step);
      }}
```

- [ ] **Step 4: MapView emits drag events**

In `src/web/components/MapView.tsx`:
1. Add import `import type { QuestEvent } from '../quest/quest';`
2. Signature: `export function MapView({ session, visible, onQuestEvent }: { session: Session; visible: Set<string> | null; onQuestEvent: (e: QuestEvent) => void }) {`
3. `onNodeDragStop={(_, n) => { savePosition(n.id, n.position); onQuestEvent('node-dragged'); }}`

- [ ] **Step 5: ReplayBar shows playback and pulse**

Replace `src/web/components/ReplayBar.tsx`:
```tsx
import type { Step } from '../../core/model';

export function ReplayBar({ timeline, cursor, onChange, playing, pulse }: { timeline: Step[]; cursor: number | null; onChange: (c: number | null) => void; playing: boolean; pulse: boolean }) {
  const value = cursor ?? timeline.length;
  const current = timeline[value - 1];
  return (
    <div className={`replay${pulse ? ' pulse' : ''}`}>
      <span>{playing ? 'Playing demo…' : cursor === null ? 'Live' : `Step ${value} / ${timeline.length}`}</span>
      <input type="range" min={0} max={timeline.length} value={value} aria-label="Replay position" onChange={(e) => {
        const v = Number(e.target.value);
        onChange(v >= timeline.length ? null : v);
      }} />
      <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current ? `${current.timestamp ? new Date(current.timestamp).toLocaleTimeString() : ''} ${current.label}` : ''}
      </span>
      {cursor !== null && <button onClick={() => onChange(null)}>{playing ? 'Skip to end' : 'Back to live'}</button>}
    </div>
  );
}
```

- [ ] **Step 6: SessionList gets the pinned demo and the "?" button**

Replace `src/web/components/SessionList.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { DEMO_ID, DEMO_TITLE } from '../../core/demo';
import type { SessionSummary } from '../../core/model';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const base = (p: string | null) => (p ? p.split('/').filter(Boolean).pop() ?? p : 'unknown project');

export function SessionList({ sessions, activeId, onSelect, onTour, highlight }: { sessions: SessionSummary[]; activeId: string | null; onSelect: (id: string) => void; onTour: () => void; highlight: boolean }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return sessions.filter((s) => `${s.title ?? ''} ${s.cwd ?? ''} ${s.id}`.toLowerCase().includes(needle));
  }, [sessions, q]);
  return (
    <nav className={`sidebar${highlight ? ' pulse' : ''}`} aria-label="Sessions">
      <div className="sidebar-head">
        <input placeholder="Filter sessions" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="tour-button" onClick={onTour} title="Take the tour" aria-label="Take the tour">?</button>
      </div>
      <button className="session-item demo-item" aria-current={activeId === DEMO_ID} onClick={() => onSelect(DEMO_ID)}>
        ▶ {DEMO_TITLE.replace('Demo: ', 'Demo: take the tour · ')}
        <small>Built-in example session</small>
      </button>
      {shown.length === 0 && <p className="empty" style={{ padding: 12 }}>No sessions found.</p>}
      {shown.map((s) => (
        <button key={s.id} className="session-item" aria-current={s.id === activeId} onClick={() => onSelect(s.id)}>
          {s.title ?? s.id.slice(0, 8)}
          <small>{base(s.cwd)} · {ago(s.updatedAt)}</small>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 7: App wires it together**

Replace `src/web/App.tsx`:
```tsx
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
import { isComplete, nextItem, questReducer, type QuestEvent } from './quest/quest';
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
  const [quest, dispatch] = useReducer(questReducer, undefined, () => loadQuest());
  const emit = useCallback((event: QuestEvent) => dispatch({ type: 'event', event }), []);

  useEffect(() => saveQuest(quest), [quest]);
  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);

  // First run (or "?" pressed): open the demo and play it like a live session.
  useEffect(() => {
    if (quest.started) return;
    dispatch({ type: 'start' });
    setView('flow');
    setActiveId(DEMO_ID);
    setPlaying(true);
  }, [quest.started]);

  useEffect(() => {
    setSession(null);
    setCursor(null);
    setSelected(null);
    if (activeId !== DEMO_ID) setPlaying(false);
    if (!activeId) return;
    if (activeId === DEMO_ID) {
      setSession(demoSession());
      return;
    }
    setHighlightList(false);
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
      <SessionList sessions={sessions} activeId={activeId} onSelect={setActiveId} onTour={() => dispatch({ type: 'reset' })} highlight={highlightList} />
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
              <ReactFlowProvider key={`${session.id}-${view}`}>
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
```

- [ ] **Step 8: Styles**

Append to `src/web/styles.css`:
```css
.sidebar-head { display: flex; align-items: center; gap: 6px; padding-right: 12px; }
.sidebar-head input { flex: 1; width: auto; margin-right: 0; }
.tour-button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; font-weight: 700; }
.demo-item { font-weight: 600; color: var(--accent); }
.quest { position: absolute; right: 16px; bottom: 16px; z-index: 20; width: 300px; padding: 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); font-size: 13px; }
.quest header { display: flex; justify-content: space-between; margin-bottom: 8px; }
.quest header span { color: var(--muted); }
.quest-bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; margin-bottom: 10px; }
.quest-bar div { height: 100%; background: var(--accent); transition: width 0.4s ease; }
.quest ol { list-style: none; margin: 0 0 8px; padding: 0; }
.quest li { display: flex; gap: 8px; padding: 4px 0; color: var(--muted); }
.quest li.current { color: var(--ink); font-weight: 600; }
.quest li.ticked { color: var(--ink); }
.quest li small { display: block; font-weight: 400; color: var(--muted); margin-top: 2px; }
.quest-check { flex: none; width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; font-size: 11px; }
.quest li.ticked .quest-check { background: var(--text); border-color: var(--text); color: #fff; animation: tick 0.3s ease; }
.quest-skip { background: none; border: 0; padding: 0; color: var(--muted); cursor: pointer; font: inherit; font-size: 12px; text-decoration: underline; }
.quest-primary { margin-top: 8px; padding: 6px 12px; border-radius: 6px; border: 0; background: var(--accent); color: #fff; cursor: pointer; font: inherit; }
.pulse { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); } 50% { box-shadow: 0 0 0 8px transparent; } }
@keyframes tick { from { transform: scale(0.4); } to { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .pulse { animation: none; outline: 2px solid var(--accent); outline-offset: 2px; }
  .quest li.ticked .quest-check, .quest-bar div { animation: none; transition: none; }
}
```

- [ ] **Step 9: Verify build**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/web
git commit -m "feat(web): first-run quest card, demo playback and guided pulses"
```

---

## Task 4: Browser check and docs

**Files:**
- Modify: `README.md` (add a "First time?" line), `docs/v1-check.md` (append a quest section)

- [ ] **Step 1: Run the app fresh**

Run in the background: `npx tsx src/server/cli.ts --no-open` and `npx vite --strictPort --force`, then open `http://localhost:5173` in a tab with `localStorage.removeItem('sv.quest.v1')` run first.

- [ ] **Step 2: Check each behaviour**

Expected:
- The demo opens and plays for ~15 s ("Playing demo…"), with the view following new steps; item 1 ticks at the end.
- The next item's target pulses: a step box, then the folded turn, then the helper box, then the red step, then the Project map button, then the replay bar.
- Each action ticks its item: click a step, open the folded turn, open the helper, click the red `npm test` step, switch to the map, move the slider, drag a box.
- The finish card shows "You're ready", and its button closes the card, clears the canvas and pulses the session list.
- Reload: the card stays closed. "?" restarts from item 1 with playback.
- Dark and light (toggle the OS appearance or devtools emulation) both look right.

- [ ] **Step 3: Docs**

Add to `README.md` under the feature list:
```markdown
**First time?** The viewer opens a short demo and a 2-minute quest that walks you through every feature. Press **?** in the sidebar to take it again.
```
Append to `docs/v1-check.md` a "First-run quest" section listing the Step 2 results.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/v1-check.md
git commit -m "docs: first-run quest in README and check notes"
```

---

## Self-review (done while writing)

- **Spec coverage:** demo session (§3) → T1; rules, storage, playback (§3) → T2; card, pulse, pinned demo, "?" button, finish, skip, reduced motion (§2, §3, §4) → T3; browser check (§5) → T4. Spec edge cases: slider during playback → `onReplayChange` stops playback (T3); opening another session → `activeId` effect stops playback (T3); storage blocked → T2 tests; "?" → reducer reset + first-run effect (T2, T3).
- **Placeholders:** none.
- **Type consistency:** `QuestEvent`, `PulseTarget`, `QuestState`, `DEMO_ID` used identically across tasks. FlowView `follow` stays a boolean; `pulse` is `PulseTarget`.
- **Review Focus:** all five pinned in T2 tests, with the wiring verified in T4.
