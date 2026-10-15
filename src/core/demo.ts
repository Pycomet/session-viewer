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
