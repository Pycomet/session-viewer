# Session Viewer v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `npx session-viewer`, a local web app that shows Claude Code sessions as a live, replayable, draggable diagram plus a project map of touched files.

**Architecture:** A UI-free `core/` library parses Claude Code JSONL logs into a `Session` (lanes of steps) and derives a `ProjectMap`. A small Hono server on `127.0.0.1` lists sessions, serves one session, streams updates over SSE (1s mtime polling), and stores dragged layouts as JSON files. A Vite + React + React Flow front end turns sessions into graphs using pure, unit-tested functions (`buildFlowGraph`, `timelineOf`, `mapLayout`, `mergePositions`) and renders them.

**Tech Stack:** Node ≥20, TypeScript (strict), Hono + @hono/node-server, React 18, @xyflow/react 12 (React Flow), @dagrejs/dagre, Vite, tsup, Vitest, `open`.

**Spec:** `docs/PRD.md` (requirements FR-1…FR-18, NFR-1…NFR-6; Appendix A = verified log format). Background: `docs/brief.md`.

## Global Constraints

- Node.js `>=20`; ESM only (`"type": "module"`).
- Server binds to `127.0.0.1` only; no outbound network calls (NFR-1).
- Default port `4300`; default root `~/.claude/projects`; layouts dir `~/.session-viewer/layouts` (FR-16, FR-18).
- Session IDs accepted from the browser must match `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` and exist on disk. Never accept file paths from the browser (NFR-2).
- All Claude Code log-format knowledge lives in `src/core/parse.ts` and `src/core/load.ts` (NFR-4).
- Session list capped at 200 most recent (FR-1). Default open turns: last 3 (FR-7). Project map folder depth: 2 (FR-11). Live update latency ≤ 2s (FR-14), via 1000 ms polling.
- Test fixtures are synthetic. **Never commit real session logs** (they contain code and secrets).
- Imports are extensionless (`moduleResolution: "Bundler"`).

## Review Focus

1. **Half-written last line during a live session:** the parser must skip it silently and pick it up on the next poll (pinned in Task 1, test `skips blank, malformed and half-written lines`).
2. **Session ID in URL is not a known UUID (e.g. `../../etc/passwd` or a random UUID):** respond 400/404, never touch the filesystem with it (pinned in Task 4, tests `rejects non-uuid ids` / `404s unknown uuid`).
3. **Helper-agent file without `.meta.json`, or whose `toolUseId` matches nothing:** still shown as its own lane, unlinked, not dropped and no crash (pinned in Task 2, test `keeps orphan subagents as unlinked lanes`).
4. **Session with hundreds of turns:** only the last 3 turns are expanded, so the graph stays small (pinned in Task 6, test `collapses all but the last 3 turns by default`).
5. **Corrupt or hand-edited layout file / malformed PUT body:** read returns `{}`, PUT returns 400 (pinned in Task 4, tests `ignores corrupt layout files` / `rejects invalid layout bodies`).

---

## File Structure

```
session-viewer/
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .gitignore, README.md
  src/core/            # UI-free; reusable by Agent Atlas
    model.ts           # shared types (Step, Lane, Session, ProjectMap, Positions, SessionSummary)
    parse.ts           # JSONL lines -> steps (all log-format knowledge)
    load.ts            # session + subagents from disk, linking lanes
    projectMap.ts      # steps -> folder/file touch map
    discover.ts        # list sessions, find session dir, fingerprint
  src/server/
    layouts.ts         # read/write saved positions
    app.ts             # Hono routes (API + SSE + static)
    cli.ts             # npx entry (args, serve, open browser)
  src/web/
    index.html, main.tsx, App.tsx, styles.css, api.ts, useSavedLayout.ts
    graph/buildFlowGraph.ts, graph/autoLayout.ts, graph/replay.ts, graph/positions.ts, graph/mapLayout.ts
    components/SessionList.tsx, FlowView.tsx, StepNode.tsx, MapView.tsx, FolderNode.tsx, DetailsPanel.tsx, ReplayBar.tsx
  tests/helpers/records.ts
  tests/core/*.test.ts, tests/server/*.test.ts, tests/web/*.test.ts
```

---

## Task 1: Project scaffold + log parser (M1, FR-3, FR-4, FR-5)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/core/model.ts`, `src/core/parse.ts`
- Create: `tests/helpers/records.ts`, `tests/core/parse.test.ts`

**Interfaces:**
- Produces: all types in `src/core/model.ts`; `parseLog(lines: string[], laneId: string): ParsedLog`; test helpers `userText`, `assistantBlocks`, `toolUse`, `toolResult`, `toLines`.

- [ ] **Step 1: Scaffold the project**

```bash
mkdir -p ~/Documents/session-viewer && cd ~/Documents/session-viewer
git init
npm init -y
npm pkg set type=module name=session-viewer version=0.1.0 description="See your AI coding agent sessions as a picture" engines.node=">=20" bin.session-viewer=dist/cli.js files[0]=dist
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.dev:server="tsx watch src/server/cli.ts --no-open" scripts.dev:web="vite" scripts.build="vite build && tsup src/server/cli.ts --format esm --out-dir dist --target node20"
npm i hono @hono/node-server open
npm i -D typescript vitest tsx tsup vite @vitejs/plugin-react @types/node react@18 react-dom@18 @types/react@18 @types/react-dom@18 @xyflow/react @dagrejs/dagre
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

`.gitignore`:
```
node_modules
dist
*.jsonl
```

- [ ] **Step 2: Write the shared model**

`src/core/model.ts`:
```ts
export type StepKind = 'user' | 'text' | 'thinking' | 'tool' | 'error' | 'unknown';

export interface ToolCall {
  name: string;
  useId: string;
  input: Record<string, unknown>;
  result: string | null;
}

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
}

export interface Step {
  id: string;
  laneId: string;
  index: number;
  kind: StepKind;
  timestamp: string | null;
  label: string;
  detail: string;
  isError: boolean;
  tool: ToolCall | null;
  tokens: Tokens | null;
  spawnsLaneId: string | null;
}

export interface Lane {
  id: string; // 'main' or the subagent's agentId
  label: string;
  parentStepId: string | null;
  steps: Step[];
}

export interface Session {
  id: string;
  cwd: string | null;
  title: string | null;
  lanes: Lane[];
}

export interface SessionSummary {
  id: string;
  projectDir: string;
  cwd: string | null;
  title: string | null;
  updatedAt: string;
  sizeBytes: number;
}

export interface FileTouch {
  path: string;
  reads: number;
  edits: number;
}

export interface FolderBox {
  path: string;
  files: FileTouch[];
  touches: number;
}

export interface ProjectMap {
  folders: FolderBox[];
}

export type Positions = Record<string, { x: number; y: number }>;

export const MAIN_LANE = 'main';
```

- [ ] **Step 3: Write test helpers that mirror real record shapes (PRD Appendix A)**

`tests/helpers/records.ts`:
```ts
let n = 0;
export const uid = () => `u${++n}`;

const ts = (s: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, s)).toISOString();

export function userText(text: string, sec = 0, extra: Record<string, unknown> = {}) {
  return { type: 'user', uuid: uid(), timestamp: ts(sec), cwd: '/proj', message: { role: 'user', content: text }, ...extra };
}

export function assistantBlocks(blocks: unknown[], sec = 1, extra: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    uuid: uid(),
    timestamp: ts(sec),
    cwd: '/proj',
    requestId: `req_${uid()}`,
    message: { role: 'assistant', content: blocks, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } },
    ...extra,
  };
}

export const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input });

export function toolResult(useId: string, content: string, isError = false, sec = 2) {
  return {
    type: 'user',
    uuid: uid(),
    timestamp: ts(sec),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: useId, content, is_error: isError }] },
  };
}

export const toLines = (recs: unknown[]) => recs.map((r) => JSON.stringify(r));
```

- [ ] **Step 4: Write the failing parser tests**

`tests/core/parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseLog } from '../../src/core/parse';
import { assistantBlocks, toLines, toolResult, toolUse, userText } from '../helpers/records';

describe('parseLog', () => {
  it('turns user text, agent text and a tool call into steps with the result attached', () => {
    const { steps } = parseLog(
      toLines([
        userText('fix the login bug'),
        assistantBlocks([{ type: 'text', text: 'Looking now' }, toolUse('t1', 'Read', { file_path: '/proj/src/login.ts' })]),
        toolResult('t1', 'file contents'),
      ]),
      'main',
    );
    expect(steps.map((s) => s.kind)).toEqual(['user', 'text', 'tool']);
    expect(steps[2].tool).toMatchObject({ name: 'Read', useId: 't1', result: 'file contents' });
    expect(steps[2].label).toBe('Read: /proj/src/login.ts');
    expect(steps.every((s) => s.laneId === 'main')).toBe(true);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('skips blank, malformed and half-written lines', () => {
    const good = toLines([userText('hi')]);
    const { steps } = parseLog(['', 'not json', ...good, '{"type":"assistant","mess'], 'main');
    expect(steps).toHaveLength(1);
  });

  it('turns unknown content blocks into unknown steps and ignores unknown record types', () => {
    const { steps } = parseLog(
      toLines([{ type: 'queue-operation', sessionId: 'x' }, assistantBlocks([{ type: 'hologram', data: 1 }])]),
      'main',
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'unknown', label: '[hologram]' });
  });

  it('counts tokens once per API request', () => {
    const a = assistantBlocks([{ type: 'text', text: 'one' }]);
    const b = { ...assistantBlocks([{ type: 'text', text: 'two' }]), requestId: a.requestId };
    const { steps } = parseLog(toLines([a, b]), 'main');
    expect(steps[0].tokens).toEqual({ input: 10, output: 5, cacheRead: 100 });
    expect(steps[1].tokens).toBeNull();
  });

  it('flags failed tool results and API errors', () => {
    const { steps } = parseLog(
      toLines([
        assistantBlocks([toolUse('t1', 'Bash', { command: 'npm test' })]),
        toolResult('t1', 'exit 1', true),
        assistantBlocks([{ type: 'text', text: 'API Error: overloaded' }], 3, { isApiErrorMessage: true }),
      ]),
      'main',
    );
    expect(steps[0].isError).toBe(true);
    expect(steps[1]).toMatchObject({ kind: 'error', isError: true });
  });

  it('reads cwd and the latest ai-title, and skips meta user records', () => {
    const parsed = parseLog(
      toLines([
        { type: 'ai-title', aiTitle: 'First' },
        userText('<system-reminder>x</system-reminder>', 0, { isMeta: true }),
        userText('hello'),
        { type: 'ai-title', aiTitle: 'Fix login bug' },
      ]),
      'main',
    );
    expect(parsed.cwd).toBe('/proj');
    expect(parsed.title).toBe('Fix login bug');
    expect(parsed.steps).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run tests/core/parse.test.ts`
Expected: FAIL, `Cannot find module '../../src/core/parse'` (or similar).

- [ ] **Step 6: Implement the parser**

`src/core/parse.ts`:
```ts
import type { Step, Tokens } from './model';

// All knowledge of Claude Code's JSONL record format lives here and in load.ts (PRD NFR-4, Appendix A).

const LABEL_MAX = 140;
const DETAIL_MAX = 20_000;
const INPUT_KEYS = ['description', 'command', 'file_path', 'notebook_path', 'pattern', 'query', 'url', 'skill', 'prompt'];

export interface ParsedLog {
  steps: Step[];
  cwd: string | null;
  title: string | null;
}

type Rec = Record<string, any>;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const label = (s: string) => clip(oneLine(s), LABEL_MAX);
const detail = (s: string) => clip(s, DETAIL_MAX);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (c && typeof c === 'object' && typeof (c as Rec).text === 'string' ? (c as Rec).text : ''))
    .filter(Boolean)
    .join('\n');
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  for (const key of INPUT_KEYS) {
    if (typeof input[key] === 'string') return label(`${name}: ${input[key]}`);
  }
  return name;
}

function tokensOf(rec: Rec): Tokens | null {
  const u = rec.message?.usage;
  if (!u || typeof u !== 'object') return null;
  return {
    input: Number(u.input_tokens) || 0,
    output: Number(u.output_tokens) || 0,
    cacheRead: Number(u.cache_read_input_tokens) || 0,
  };
}

export function parseLog(lines: string[], laneId: string): ParsedLog {
  const steps: Step[] = [];
  const byUseId = new Map<string, Step>();
  const seenRequests = new Set<string>();
  let cwd: string | null = null;
  let title: string | null = null;

  const push = (s: Omit<Step, 'index' | 'laneId' | 'tokens' | 'spawnsLaneId'> & Partial<Pick<Step, 'tokens'>>) => {
    const step: Step = { tokens: null, spawnsLaneId: null, ...s, index: steps.length, laneId };
    steps.push(step);
    return step;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let rec: Rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // malformed or half-written (live session mid-write)
    }
    if (!rec || typeof rec !== 'object') continue;
    if (!cwd && typeof rec.cwd === 'string') cwd = rec.cwd;
    if (rec.type === 'ai-title' && typeof rec.aiTitle === 'string') {
      title = rec.aiTitle;
      continue;
    }
    if (rec.isMeta === true) continue;

    const timestamp = typeof rec.timestamp === 'string' ? rec.timestamp : null;
    const uuid = typeof rec.uuid === 'string' ? rec.uuid : `line${steps.length}`;
    const content = rec.message?.content;

    if (rec.type === 'user') {
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type !== 'tool_result') continue;
          const target = byUseId.get(block.tool_use_id);
          if (!target?.tool) continue;
          target.tool.result = detail(textOf(block.content));
          if (block.is_error === true) target.isError = true;
        }
      }
      const text = textOf(content);
      if (text.trim()) {
        push({ id: uuid, kind: 'user', timestamp, label: label(text), detail: detail(text), isError: false, tool: null });
      }
      continue;
    }

    if (rec.type !== 'assistant') continue;

    let tokens: Tokens | null = null;
    const requestId = typeof rec.requestId === 'string' ? rec.requestId : uuid;
    if (!seenRequests.has(requestId)) {
      seenRequests.add(requestId);
      tokens = tokensOf(rec);
    }
    const takeTokens = () => {
      const t = tokens;
      tokens = null;
      return t;
    };

    if (rec.isApiErrorMessage === true) {
      const text = textOf(content) || 'API error';
      push({ id: uuid, kind: 'error', timestamp, label: label(text), detail: detail(text), isError: true, tool: null, tokens: takeTokens() });
      continue;
    }

    const blocks: Rec[] = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
    blocks.forEach((block, i) => {
      const id = `${uuid}#${i}`;
      const base = { id, timestamp, isError: false, tool: null, tokens: takeTokens() };
      if (block?.type === 'text') {
        if (!String(block.text ?? '').trim()) return;
        push({ ...base, kind: 'text', label: label(block.text), detail: detail(block.text) });
      } else if (block?.type === 'thinking') {
        const t = String(block.thinking ?? '');
        push({ ...base, kind: 'thinking', label: label(t || 'thinking'), detail: detail(t) });
      } else if (block?.type === 'tool_use') {
        const name = String(block.name ?? 'tool');
        const input: Record<string, unknown> = block.input && typeof block.input === 'object' ? block.input : {};
        const step = push({
          ...base,
          kind: 'tool',
          label: toolLabel(name, input),
          detail: detail(JSON.stringify(input, null, 2)),
          tool: { name, useId: String(block.id ?? id), input, result: null },
        });
        byUseId.set(step.tool!.useId, step);
      } else {
        const type = String(block?.type ?? 'unknown');
        push({ ...base, kind: 'unknown', label: `[${type}]`, detail: detail(JSON.stringify(block, null, 2)) });
      }
    });
  }

  return { steps, cwd, title };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/core/parse.test.ts && npx tsc --noEmit`
Expected: 6 passed; no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): scaffold project and parse Claude Code session logs into steps"
```

---

## Task 2: Load a session with linked helper-agent lanes (M1, FR-2)

**Files:**
- Create: `src/core/load.ts`
- Test: `tests/core/load.test.ts`

**Interfaces:**
- Consumes: `parseLog(lines, laneId)` (Task 1); `Session`, `Lane`, `MAIN_LANE` (Task 1).
- Produces: `loadSession(projectDir: string, sessionId: string): Promise<Session>`; `subagentDir(projectDir: string, sessionId: string): string`.

- [ ] **Step 1: Write the failing tests**

`tests/core/load.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSession } from '../../src/core/load';
import { assistantBlocks, toLines, toolResult, toolUse, userText } from '../helpers/records';

const SID = '11111111-2222-3333-4444-555555555555';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'sv-load-'));
  await writeFile(
    join(dir, `${SID}.jsonl`),
    toLines([
      userText('review the branch'),
      assistantBlocks([toolUse('toolu_A', 'Agent', { description: 'Code review', prompt: 'review' })]),
      toolResult('toolu_A', 'done'),
      { type: 'ai-title', aiTitle: 'Review branch' },
    ]).join('\n'),
  );
  const sub = join(dir, SID, 'subagents');
  await mkdir(sub, { recursive: true });
  await writeFile(join(sub, 'agent-aaa.jsonl'), toLines([userText('review', 0, { isSidechain: true, agentId: 'aaa' }), assistantBlocks([{ type: 'text', text: 'LGTM' }])]).join('\n'));
  await writeFile(join(sub, 'agent-aaa.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Code review', toolUseId: 'toolu_A' }));
  await writeFile(join(sub, 'agent-bbb.jsonl'), toLines([assistantBlocks([{ type: 'text', text: 'orphan' }])]).join('\n'));
  return dir;
}

describe('loadSession', () => {
  it('loads the main lane with cwd and title', async () => {
    const s = await loadSession(await fixture(), SID);
    expect(s).toMatchObject({ id: SID, cwd: '/proj', title: 'Review branch' });
    expect(s.lanes[0].id).toBe('main');
    expect(s.lanes[0].steps).toHaveLength(2);
  });

  it('links a helper agent lane to the Agent step that started it', async () => {
    const s = await loadSession(await fixture(), SID);
    const lane = s.lanes.find((l) => l.id === 'aaa')!;
    const agentStep = s.lanes[0].steps[1];
    expect(lane.label).toBe('Code review');
    expect(lane.parentStepId).toBe(agentStep.id);
    expect(agentStep.spawnsLaneId).toBe('aaa');
    expect(lane.steps.every((st) => st.laneId === 'aaa')).toBe(true);
  });

  it('keeps orphan subagents as unlinked lanes', async () => {
    const s = await loadSession(await fixture(), SID);
    const lane = s.lanes.find((l) => l.id === 'bbb')!;
    expect(lane).toMatchObject({ label: 'agent bbb', parentStepId: null });
    expect(lane.steps).toHaveLength(1);
  });

  it('works when there is no subagents folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sv-load-'));
    await writeFile(join(dir, `${SID}.jsonl`), toLines([userText('hi')]).join('\n'));
    const s = await loadSession(dir, SID);
    expect(s.lanes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/load.test.ts`
Expected: FAIL, cannot find module `../../src/core/load`.

- [ ] **Step 3: Implement**

`src/core/load.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAIN_LANE, type Lane, type Session } from './model';
import { parseLog } from './parse';

export const subagentDir = (projectDir: string, sessionId: string) => join(projectDir, sessionId, 'subagents');

async function readLines(path: string): Promise<string[]> {
  return (await readFile(path, 'utf8')).split('\n');
}

async function readMeta(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function loadSession(projectDir: string, sessionId: string): Promise<Session> {
  const main = parseLog(await readLines(join(projectDir, `${sessionId}.jsonl`)), MAIN_LANE);
  const lanes: Lane[] = [{ id: MAIN_LANE, label: 'Main', parentStepId: null, steps: main.steps }];
  const spawnedBy = new Map<string, string>(); // agentId -> toolUseId

  const dir = subagentDir(projectDir, sessionId);
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => /^agent-.+\.jsonl$/.test(f)).sort();
  } catch {
    files = [];
  }

  for (const file of files) {
    const agentId = file.slice('agent-'.length, -'.jsonl'.length);
    const meta = await readMeta(join(dir, `agent-${agentId}.meta.json`));
    const parsed = parseLog(await readLines(join(dir, file)), agentId);
    const description = typeof meta?.description === 'string' ? meta.description : null;
    const agentType = typeof meta?.agentType === 'string' ? meta.agentType : null;
    lanes.push({ id: agentId, label: description ?? agentType ?? `agent ${agentId}`, parentStepId: null, steps: parsed.steps });
    if (typeof meta?.toolUseId === 'string') spawnedBy.set(agentId, meta.toolUseId);
  }

  const stepByUseId = new Map(lanes.flatMap((l) => l.steps).filter((s) => s.tool).map((s) => [s.tool!.useId, s]));
  for (const lane of lanes) {
    const useId = spawnedBy.get(lane.id);
    const parent = useId ? stepByUseId.get(useId) : undefined;
    if (!parent) continue;
    lane.parentStepId = parent.id;
    parent.spawnsLaneId = lane.id;
  }

  return { id: sessionId, cwd: main.cwd, title: main.title, lanes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core && npx tsc --noEmit`
Expected: all core tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/load.ts tests/core/load.test.ts
git commit -m "feat(core): load sessions with helper-agent lanes linked to their parent step"
```

---

## Task 3: Project map + session discovery (M1, FR-1, FR-11, FR-12)

**Files:**
- Create: `src/core/projectMap.ts`, `src/core/discover.ts`
- Test: `tests/core/projectMap.test.ts`, `tests/core/discover.test.ts`

**Interfaces:**
- Consumes: `Session`, `ProjectMap`, `SessionSummary` (Task 1); `subagentDir` (Task 2).
- Produces:
  - `buildProjectMap(session: Session, visible?: Set<string> | null): ProjectMap`; `OUTSIDE = '(outside project)'`
  - `SESSION_ID_RE: RegExp`; `listSessions(root: string, limit?: number): Promise<SessionSummary[]>`; `findSessionDir(root: string, id: string): Promise<string | null>`; `sessionFingerprint(projectDir: string, id: string): Promise<string>`

- [ ] **Step 1: Write the failing project-map tests**

`tests/core/projectMap.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Session, Step } from '../../src/core/model';
import { buildProjectMap, OUTSIDE } from '../../src/core/projectMap';

let i = 0;
const tool = (name: string, file_path: string): Step => ({
  id: `s${++i}`, laneId: 'main', index: i, kind: 'tool', timestamp: null, label: name, detail: '', isError: false,
  tool: { name, useId: `t${i}`, input: { file_path }, result: null }, tokens: null, spawnsLaneId: null,
});
const session = (steps: Step[], cwd: string | null = '/proj'): Session => ({ id: 'x', cwd, title: null, lanes: [{ id: 'main', label: 'Main', parentStepId: null, steps }] });

describe('buildProjectMap', () => {
  it('groups files by folder (max 2 levels) and counts reads vs edits', () => {
    const map = buildProjectMap(session([
      tool('Read', '/proj/src/auth/login.ts'),
      tool('Edit', '/proj/src/auth/login.ts'),
      tool('Write', '/proj/src/auth/deep/nested/x.ts'),
      tool('Read', '/proj/README.md'),
    ]));
    const auth = map.folders.find((f) => f.path === 'src/auth')!;
    expect(auth.touches).toBe(3);
    expect(auth.files).toContainEqual({ path: 'src/auth/login.ts', reads: 1, edits: 1 });
    expect(auth.files).toContainEqual({ path: 'src/auth/deep/nested/x.ts', reads: 0, edits: 1 });
    expect(map.folders.find((f) => f.path === '.')!.files).toEqual([{ path: 'README.md', reads: 1, edits: 0 }]);
    expect(map.folders[0].path).toBe('src/auth'); // busiest first
  });

  it('puts files outside the project (or with no cwd) in one box', () => {
    expect(buildProjectMap(session([tool('Read', '/etc/hosts')])).folders[0]).toMatchObject({ path: OUTSIDE, files: [{ path: '/etc/hosts', reads: 1, edits: 0 }] });
    expect(buildProjectMap(session([tool('Read', '/proj/a.ts')], null)).folders[0].path).toBe(OUTSIDE);
  });

  it('ignores non-file tools and respects the replay filter', () => {
    const a = tool('Read', '/proj/a.ts');
    const b = tool('Edit', '/proj/b.ts');
    const bash = { ...tool('Bash', '/proj/c.ts') };
    const map = buildProjectMap(session([a, b, bash]), new Set([a.id]));
    expect(map.folders).toEqual([{ path: '.', files: [{ path: 'a.ts', reads: 1, edits: 0 }], touches: 1 }]);
  });
});
```

- [ ] **Step 2: Write the failing discovery tests**

`tests/core/discover.test.ts`:
```ts
import { appendFile, mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSessionDir, listSessions, sessionFingerprint } from '../../src/core/discover';
import { toLines, userText } from '../helpers/records';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'sv-root-'));
  await mkdir(join(r, '-proj-one'));
  await mkdir(join(r, '-proj-two'));
  await writeFile(join(r, '-proj-one', `${A}.jsonl`), toLines([userText('hi'), { type: 'ai-title', aiTitle: 'Old one' }]).join('\n'));
  await writeFile(join(r, '-proj-two', `${B}.jsonl`), toLines([userText('yo')]).join('\n'));
  await writeFile(join(r, '-proj-two', 'notes.jsonl'), '{}');
  await utimes(join(r, '-proj-one', `${A}.jsonl`), new Date('2026-01-01'), new Date('2026-01-01'));
  return r;
}

describe('discover', () => {
  it('lists uuid-named sessions newest first with title and cwd', async () => {
    const list = await listSessions(await root());
    expect(list.map((s) => s.id)).toEqual([B, A]);
    expect(list[1]).toMatchObject({ title: 'Old one', cwd: '/proj', projectDir: expect.stringContaining('-proj-one') });
  });

  it('respects the limit', async () => {
    expect(await listSessions(await root(), 1)).toHaveLength(1);
  });

  it('finds a session dir only for valid, existing ids', async () => {
    const r = await root();
    expect(await findSessionDir(r, A)).toBe(join(r, '-proj-one'));
    expect(await findSessionDir(r, '../../etc/passwd')).toBeNull();
    expect(await findSessionDir(r, 'cccccccc-0000-0000-0000-000000000003')).toBeNull();
  });

  it('changes fingerprint when the log grows', async () => {
    const r = await root();
    const dir = join(r, '-proj-two');
    const before = await sessionFingerprint(dir, B);
    await appendFile(join(dir, `${B}.jsonl`), '\n' + toLines([userText('more')])[0]);
    expect(await sessionFingerprint(dir, B)).not.toBe(before);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/core/projectMap.test.ts tests/core/discover.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the project map**

`src/core/projectMap.ts`:
```ts
import type { FileTouch, FolderBox, ProjectMap, Session } from './model';

// No node: imports here, because this module is also bundled into the browser (MapView).
export const OUTSIDE = '(outside project)';
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const DEPTH = 2;

function locate(abs: string, cwd: string | null): { folder: string; path: string } {
  if (!cwd || !abs.startsWith(cwd.replace(/\/$/, '') + '/')) return { folder: OUTSIDE, path: abs };
  const rel = abs.slice(cwd.replace(/\/$/, '').length + 1);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
  return { folder: dir === '.' ? '.' : dir.split('/').slice(0, DEPTH).join('/'), path: rel };
}

export function buildProjectMap(session: Session, visible: Set<string> | null = null): ProjectMap {
  const folders = new Map<string, Map<string, FileTouch>>();
  for (const step of session.lanes.flatMap((l) => l.steps)) {
    if (visible && !visible.has(step.id)) continue;
    const name = step.tool?.name;
    if (!name || !(READ_TOOLS.has(name) || EDIT_TOOLS.has(name))) continue;
    const input = step.tool!.input;
    const abs = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null;
    if (!abs) continue;
    const { folder, path } = locate(abs, session.cwd);
    const files = folders.get(folder) ?? new Map<string, FileTouch>();
    folders.set(folder, files);
    const touch = files.get(path) ?? { path, reads: 0, edits: 0 };
    files.set(path, touch);
    if (EDIT_TOOLS.has(name)) touch.edits++;
    else touch.reads++;
  }
  const total = (f: FileTouch) => f.reads + f.edits;
  const boxes: FolderBox[] = [...folders].map(([path, files]) => {
    const list = [...files.values()].sort((a, b) => total(b) - total(a) || a.path.localeCompare(b.path));
    return { path, files: list, touches: list.reduce((n, f) => n + total(f), 0) };
  });
  boxes.sort((a, b) => b.touches - a.touches || a.path.localeCompare(b.path));
  return { folders: boxes };
}
```

- [ ] **Step 5: Implement discovery**

`src/core/discover.ts`:
```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionSummary } from './model';
import { subagentDir } from './load';

export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function quickMeta(text: string): { cwd: string | null; title: string | null } {
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of text.split('\n')) {
    const wantsCwd = !cwd && line.includes('"cwd"');
    const isTitle = line.includes('"ai-title"');
    if (!wantsCwd && !isTitle) continue;
    try {
      const rec = JSON.parse(line);
      if (wantsCwd && typeof rec.cwd === 'string') cwd = rec.cwd;
      if (rec.type === 'ai-title' && typeof rec.aiTitle === 'string') title = rec.aiTitle;
    } catch {
      /* half-written line */
    }
  }
  return { cwd, title };
}

export async function listSessions(root: string, limit = 200): Promise<SessionSummary[]> {
  const found: { id: string; projectDir: string; mtime: Date; size: number }[] = [];
  for (const project of await safeReaddir(root)) {
    const projectDir = join(root, project);
    for (const file of await safeReaddir(projectDir)) {
      const id = file.replace(/\.jsonl$/, '');
      if (!file.endsWith('.jsonl') || !SESSION_ID_RE.test(id)) continue;
      const s = await stat(join(projectDir, file));
      found.push({ id, projectDir, mtime: s.mtime, size: s.size });
    }
  }
  found.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return Promise.all(
    found.slice(0, limit).map(async (f) => ({
      id: f.id,
      projectDir: f.projectDir,
      updatedAt: f.mtime.toISOString(),
      sizeBytes: f.size,
      ...quickMeta(await readFile(join(f.projectDir, `${f.id}.jsonl`), 'utf8')),
    })),
  );
}

export async function findSessionDir(root: string, id: string): Promise<string | null> {
  if (!SESSION_ID_RE.test(id)) return null;
  for (const project of await safeReaddir(root)) {
    const projectDir = join(root, project);
    if ((await safeReaddir(projectDir)).includes(`${id}.jsonl`)) return projectDir;
  }
  return null;
}

export async function sessionFingerprint(projectDir: string, id: string): Promise<string> {
  const parts: string[] = [];
  const add = async (path: string) => {
    try {
      const s = await stat(path);
      parts.push(`${path}:${s.size}:${s.mtimeMs}`);
    } catch {
      /* file vanished */
    }
  };
  await add(join(projectDir, `${id}.jsonl`));
  const sub = subagentDir(projectDir, id);
  for (const f of (await safeReaddir(sub)).sort()) await add(join(sub, f));
  return parts.join('|');
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/core && npx tsc --noEmit`
Expected: all core tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core tests/core
git commit -m "feat(core): project map of touched files and session discovery"
```

---

## Task 4: Local server, API, live stream and layout storage (M2, FR-14, FR-16, NFR-1, NFR-2)

**Files:**
- Create: `src/server/layouts.ts`, `src/server/app.ts`
- Test: `tests/server/layouts.test.ts`, `tests/server/app.test.ts`

**Interfaces:**
- Consumes: `listSessions`, `findSessionDir`, `sessionFingerprint`, `SESSION_ID_RE` (Task 3); `loadSession` (Task 2); `Positions` (Task 1).
- Produces:
  - `readLayout(dir: string, key: string): Promise<Positions>`; `writeLayout(dir: string, key: string, p: Positions): Promise<void>`; `isPositions(v: unknown): v is Positions`
  - `createApp(opts: AppOptions): Hono` where `AppOptions = { root: string; layoutsDir: string; webDir: string | null; pollMs?: number }`
  - HTTP: `GET /api/sessions` → `SessionSummary[]`; `GET /api/sessions/:id` → `Session`; `GET /api/sessions/:id/stream` → SSE events named `session` with `Session` JSON; `GET|PUT /api/layouts/:id/:view` (`view` ∈ `flow|map`) → `Positions`

- [ ] **Step 1: Write the failing layout-store tests**

`tests/server/layouts.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPositions, readLayout, writeLayout } from '../../src/server/layouts';

describe('layouts', () => {
  it('round-trips positions and creates the folder', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'sv-lay-')), 'nested');
    await writeLayout(dir, 'abc.flow', { n1: { x: 1, y: 2 } });
    expect(await readLayout(dir, 'abc.flow')).toEqual({ n1: { x: 1, y: 2 } });
  });

  it('returns {} for missing or corrupt files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sv-lay-'));
    expect(await readLayout(dir, 'none.flow')).toEqual({});
    await writeFile(join(dir, 'bad.flow.json'), '{oops');
    expect(await readLayout(dir, 'bad.flow')).toEqual({});
  });

  it('validates shape', () => {
    expect(isPositions({ a: { x: 0, y: 1.5 } })).toBe(true);
    expect(isPositions({ a: { x: 'no', y: 1 } })).toBe(false);
    expect(isPositions([])).toBe(false);
    expect(isPositions({ a: { x: Infinity, y: 0 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing app tests**

`tests/server/app.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { toLines, userText } from '../helpers/records';

const ID = 'aaaaaaaa-0000-0000-0000-000000000001';

async function app() {
  const root = await mkdtemp(join(tmpdir(), 'sv-app-'));
  await mkdir(join(root, '-proj'));
  await writeFile(join(root, '-proj', `${ID}.jsonl`), toLines([userText('hello')]).join('\n'));
  const webDir = await mkdtemp(join(tmpdir(), 'sv-web-'));
  await writeFile(join(webDir, 'index.html'), '<html>viewer</html>');
  return createApp({ root, layoutsDir: join(root, '.layouts'), webDir, pollMs: 50 });
}

describe('app', () => {
  it('lists sessions', async () => {
    const res = await (await app()).request('/api/sessions');
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe(ID);
  });

  it('serves one session', async () => {
    const res = await (await app()).request(`/api/sessions/${ID}`);
    expect((await res.json()).lanes[0].steps[0].label).toBe('hello');
  });

  it('rejects non-uuid ids', async () => {
    expect((await (await app()).request('/api/sessions/..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
  });

  it('404s unknown uuid', async () => {
    expect((await (await app()).request('/api/sessions/bbbbbbbb-0000-0000-0000-000000000009')).status).toBe(404);
  });

  it('streams the session immediately over SSE', async () => {
    const res = await (await app()).request(`/api/sessions/${ID}/stream`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: session');
    expect(text).toContain('hello');
    await reader.cancel();
  });

  it('saves and returns layouts', async () => {
    const a = await app();
    const put = await a.request(`/api/layouts/${ID}/flow`, { method: 'PUT', body: JSON.stringify({ n: { x: 1, y: 2 } }), headers: { 'content-type': 'application/json' } });
    expect(put.status).toBe(204);
    expect(await (await a.request(`/api/layouts/${ID}/flow`)).json()).toEqual({ n: { x: 1, y: 2 } });
  });

  it('rejects invalid layout bodies and views', async () => {
    const a = await app();
    expect((await a.request(`/api/layouts/${ID}/flow`, { method: 'PUT', body: '"nope"' })).status).toBe(400);
    expect((await a.request(`/api/layouts/${ID}/other`)).status).toBe(400);
  });

  it('serves the web app with index.html fallback and blocks traversal', async () => {
    const a = await app();
    expect(await (await a.request('/')).text()).toContain('viewer');
    expect(await (await a.request('/some/route')).text()).toContain('viewer');
    expect(await (await a.request('/..%2F..%2Fetc%2Fpasswd')).text()).toContain('viewer');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/server`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the layout store**

`src/server/layouts.ts`:
```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Positions } from '../core/model';

export function isPositions(v: unknown): v is Positions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every(
    (p) => p && typeof p === 'object' && Number.isFinite((p as any).x) && Number.isFinite((p as any).y),
  );
}

export async function readLayout(dir: string, key: string): Promise<Positions> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8'));
    return isPositions(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeLayout(dir: string, key: string, positions: Positions): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), JSON.stringify(positions));
}
```

- [ ] **Step 5: Implement the app**

`src/server/app.ts`:
```ts
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { findSessionDir, listSessions, SESSION_ID_RE, sessionFingerprint } from '../core/discover';
import { loadSession } from '../core/load';
import { isPositions, readLayout, writeLayout } from './layouts';

export interface AppOptions {
  root: string;
  layoutsDir: string;
  webDir: string | null;
  pollMs?: number;
}

const VIEWS = new Set(['flow', 'map']);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export function createApp({ root, layoutsDir, webDir, pollMs = 1000 }: AppOptions): Hono {
  const app = new Hono();

  const resolveSession = async (id: string) => (SESSION_ID_RE.test(id) ? { dir: await findSessionDir(root, id) } : null);

  app.get('/api/sessions', async (c) => c.json(await listSessions(root)));

  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const found = await resolveSession(id);
    if (!found) return c.json({ error: 'invalid id' }, 400);
    if (!found.dir) return c.json({ error: 'not found' }, 404);
    return c.json(await loadSession(found.dir, id));
  });

  app.get('/api/sessions/:id/stream', async (c) => {
    const id = c.req.param('id');
    const found = await resolveSession(id);
    if (!found) return c.json({ error: 'invalid id' }, 400);
    if (!found.dir) return c.json({ error: 'not found' }, 404);
    const dir = found.dir;
    return streamSSE(c, async (stream) => {
      let open = true;
      let last = '';
      stream.onAbort(() => {
        open = false;
      });
      while (open) {
        const fp = await sessionFingerprint(dir, id);
        if (fp !== last) {
          last = fp;
          await stream.writeSSE({ event: 'session', data: JSON.stringify(await loadSession(dir, id)) });
        }
        await stream.sleep(pollMs);
      }
    });
  });

  app.on(['GET', 'PUT'], '/api/layouts/:id/:view', async (c) => {
    const { id, view } = c.req.param();
    if (!SESSION_ID_RE.test(id) || !VIEWS.has(view)) return c.json({ error: 'invalid' }, 400);
    const key = `${id}.${view}`;
    if (c.req.method === 'GET') return c.json(await readLayout(layoutsDir, key));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    if (!isPositions(body)) return c.json({ error: 'invalid layout' }, 400);
    await writeLayout(layoutsDir, key, body);
    return c.body(null, 204);
  });

  app.get('*', async (c) => {
    if (!webDir) return c.text('Web UI not built. Run `npm run dev:web` or `npm run build`.', 404);
    const base = normalize(webDir + sep);
    const requested = normalize(join(webDir, decodeURIComponent(new URL(c.req.url).pathname)));
    const candidates = requested.startsWith(base) && extname(requested) ? [requested, join(webDir, 'index.html')] : [join(webDir, 'index.html')];
    for (const file of candidates) {
      try {
        const body = await readFile(file);
        return c.body(body, 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      } catch {
        /* try next */
      }
    }
    return c.text('Not found', 404);
  });

  return app;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/server tests/server
git commit -m "feat(server): local API with live SSE stream and saved layouts"
```

---

## Task 5: CLI entry, `npx session-viewer` (M2, FR-18)

**Files:**
- Create: `src/server/cli.ts`
- Test: `tests/server/cli.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 4).
- Produces: `parseCliArgs(argv: string[]): { port: number; root: string; open: boolean }`; executable `dist/cli.js` after build.

- [ ] **Step 1: Write the failing test**

`tests/server/cli.test.ts`:
```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../src/server/cli';

describe('parseCliArgs', () => {
  it('has sensible defaults', () => {
    expect(parseCliArgs([])).toEqual({ port: 4300, root: join(homedir(), '.claude', 'projects'), open: true });
  });

  it('reads flags', () => {
    expect(parseCliArgs(['--port', '5000', '--root', '/tmp/x', '--no-open'])).toEqual({ port: 5000, root: '/tmp/x', open: false });
  });

  it('rejects a bad port', () => {
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow(/port/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/cli.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/server/cli.ts`:
```ts
#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import open from 'open';
import { createApp } from './app';

export function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: '4300' },
      root: { type: 'string', default: join(homedir(), '.claude', 'projects') },
      'no-open': { type: 'boolean', default: false },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid --port: ${values.port}`);
  return { port, root: resolve(values.root!), open: !values['no-open'] };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
  const app = createApp({
    root: args.root,
    layoutsDir: join(homedir(), '.session-viewer', 'layouts'),
    webDir: existsSync(join(webDir, 'index.html')) ? webDir : null,
  });
  serve({ fetch: app.fetch, port: args.port, hostname: '127.0.0.1' }, ({ port }) => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Session Viewer running at ${url} (reading ${args.root}). Local only, nothing leaves this machine.`);
    if (args.open) void open(url);
  });
}

// npx runs us through a symlink in node_modules/.bin, so compare real paths.
const entry = process.argv[1] && existsSync(process.argv[1]) ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === entry) main();
```

- [ ] **Step 4: Run tests and a smoke run**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

Run: `npx tsx src/server/cli.ts --no-open --port 4301 & sleep 2; curl -s 127.0.0.1:4301/api/sessions | head -c 300; kill %1`
Expected: JSON array of your real sessions (ids, titles, cwd).

- [ ] **Step 5: Commit**

```bash
git add src/server/cli.ts tests/server/cli.test.ts
git commit -m "feat(cli): npx session-viewer entry with port/root/no-open flags"
```

---

## Task 6: Flow graph builder + auto layout (M3, FR-6, FR-7, FR-8, FR-9)

**Files:**
- Create: `src/web/graph/buildFlowGraph.ts`, `src/web/graph/autoLayout.ts`
- Test: `tests/web/buildFlowGraph.test.ts`, `tests/web/autoLayout.test.ts`

**Interfaces:**
- Consumes: `Session`, `Step`, `Positions`, `MAIN_LANE` (Task 1).
- Produces:
  - `GraphNode = { id: string; type: 'step' | 'turn' | 'lane'; label: string; laneId: string; isError: boolean; count: number; step: Step | null }`
  - `GraphEdge = { id: string; source: string; target: string; kind: 'next' | 'spawn' }`
  - `FlowOptions = { expandedTurns: Set<string>; collapsedLanes: Set<string>; visible: Set<string> | null }`
  - `turnsOf(session: Session): { id: string; steps: Step[] }[]`; `defaultExpandedTurns(session: Session, n?: number): Set<string>`; `buildFlowGraph(session: Session, opts: FlowOptions): { nodes: GraphNode[]; edges: GraphEdge[] }`
  - `NODE_W = 260`, `NODE_H = 56`; `autoLayout(nodes: { id: string }[], edges: { source: string; target: string }[]): Positions`

- [ ] **Step 1: Write the failing tests**

`tests/web/buildFlowGraph.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Lane, Session, Step } from '../../src/core/model';
import { buildFlowGraph, defaultExpandedTurns, turnsOf } from '../../src/web/graph/buildFlowGraph';

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
  expandedTurns: defaultExpandedTurns(s), collapsedLanes: new Set<string>(), visible: null, ...extra,
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

  it('branches helper lanes from their parent step and marks errors', () => {
    const s = session(1, true);
    const { nodes, edges } = buildFlowGraph(s, opts(s));
    expect(edges).toContainEqual({ id: 'spawn:a0->s1', source: 'a0', target: 's1', kind: 'spawn' });
    expect(edges).toContainEqual({ id: 'next:s1->s2', source: 's1', target: 's2', kind: 'next' });
    expect(nodes.find((n) => n.id === 's2')!.isError).toBe(true);
  });

  it('folds a collapsed helper lane into one node', () => {
    const s = session(1, true);
    const { nodes, edges } = buildFlowGraph(s, opts(s, { collapsedLanes: new Set(['sub']) }));
    expect(nodes.find((n) => n.id === 'lane:sub')).toMatchObject({ type: 'lane', label: 'Review · 2 steps', isError: true });
    expect(edges).toContainEqual({ id: 'spawn:a0->lane:sub', source: 'a0', target: 'lane:sub', kind: 'spawn' });
  });

  it('hides helper lanes whose parent is inside a collapsed turn', () => {
    const s = session(1, true);
    const { nodes } = buildFlowGraph(s, opts(s, { expandedTurns: new Set() }));
    expect(nodes.map((n) => n.id)).toEqual(['turn:u0']);
  });

  it('shows only visible steps during replay', () => {
    const s = session(2);
    const { nodes } = buildFlowGraph(s, opts(s, { visible: new Set(['u0', 'a0', 'u1']) }));
    expect(nodes.map((n) => n.id)).toEqual(['u0', 'a0', 'u1']);
  });
});
```

`tests/web/autoLayout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/web/graph/autoLayout';

describe('autoLayout', () => {
  it('places every node, with each edge going downward', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    const p = autoLayout(nodes, edges);
    expect(Object.keys(p).sort()).toEqual(['a', 'b', 'c']);
    expect(p.b.y).toBeGreaterThan(p.a.y);
    expect(p.c.y).toBeGreaterThan(p.b.y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/web`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the graph builder**

`src/web/graph/buildFlowGraph.ts`:
```ts
import { MAIN_LANE, type Lane, type Session, type Step } from '../../core/model';

export interface GraphNode {
  id: string;
  type: 'step' | 'turn' | 'lane';
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
  collapsedLanes: Set<string>;
  visible: Set<string> | null;
}

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

export function defaultExpandedTurns(session: Session, n = 3): Set<string> {
  return new Set(turnsOf(session).slice(-n).map((t) => t.id));
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
    const steps = turn.steps.filter(isVisible);
    if (steps.length === 0) return;
    if (opts.expandedTurns.has(turn.id)) {
      for (const s of steps) {
        nodes.push(stepNode(s));
        mainIds.push(s.id);
        expandedSteps.push(s);
      }
    } else {
      nodes.push({ id: turn.id, type: 'turn', label: `Turn ${i + 1} · ${plural(steps.length)}`, laneId: MAIN_LANE, isError: steps.some((s) => s.isError), count: steps.length, step: null });
      mainIds.push(turn.id);
    }
  });
  chain(mainIds);

  const addLanes = (parent: Step) => {
    for (const lane of lanesByParent.get(parent.id) ?? []) {
      const steps = lane.steps.filter(isVisible);
      if (steps.length === 0) continue;
      if (opts.collapsedLanes.has(lane.id)) {
        const id = `lane:${lane.id}`;
        nodes.push({ id, type: 'lane', label: `${lane.label} · ${plural(steps.length)}`, laneId: lane.id, isError: steps.some((s) => s.isError), count: steps.length, step: null });
        edges.push({ id: `spawn:${parent.id}->${id}`, source: parent.id, target: id, kind: 'spawn' });
        continue;
      }
      edges.push({ id: `spawn:${parent.id}->${steps[0].id}`, source: parent.id, target: steps[0].id, kind: 'spawn' });
      for (const s of steps) nodes.push(stepNode(s));
      chain(steps.map((s) => s.id));
      steps.forEach(addLanes); // helpers started by helpers
    }
  };
  expandedSteps.forEach(addLanes);

  return { nodes, edges };
}
```

- [ ] **Step 4: Implement auto layout**

`src/web/graph/autoLayout.ts`:
```ts
import dagre from '@dagrejs/dagre';
import type { Positions } from '../../core/model';

export const NODE_W = 260;
export const NODE_H = 56;

export function autoLayout(nodes: { id: string }[], edges: { source: string; target: string }[]): Positions {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 36 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out: Positions = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    out[n.id] = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  }
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/graph tests/web
git commit -m "feat(web): flow graph builder with folded turns, helper branches and auto layout"
```

---

## Task 7: Replay timeline, saved-position merging, map layout (M4, FR-15, FR-16, FR-13)

**Files:**
- Create: `src/web/graph/replay.ts`, `src/web/graph/positions.ts`, `src/web/graph/mapLayout.ts`
- Test: `tests/web/replay.test.ts`, `tests/web/positions.test.ts`, `tests/web/mapLayout.test.ts`

**Interfaces:**
- Consumes: `Session`, `Step`, `ProjectMap`, `Positions` (Task 1).
- Produces:
  - `timelineOf(session: Session): Step[]`; `visibleUpTo(timeline: Step[], cursor: number): Set<string>` (cursor = number of steps shown)
  - `mergePositions(auto: Positions, saved: Positions): Positions`
  - `FOLDER_W = 300`; `mapLayout(map: ProjectMap): Positions`; `heat(touches: number, max: number): number` (0.08–0.6)

- [ ] **Step 1: Write the failing tests**

`tests/web/replay.test.ts`:
```ts
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
```

`tests/web/positions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mergePositions } from '../../src/web/graph/positions';

describe('mergePositions', () => {
  it('prefers saved positions only for nodes that still exist', () => {
    expect(mergePositions({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, { b: { x: 9, y: 9 }, gone: { x: 5, y: 5 } })).toEqual({ a: { x: 0, y: 0 }, b: { x: 9, y: 9 } });
  });
});
```

`tests/web/mapLayout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FOLDER_W, heat, mapLayout } from '../../src/web/graph/mapLayout';

const folder = (path: string, files: number) => ({ path, touches: files, files: Array.from({ length: files }, (_, i) => ({ path: `${path}/${i}`, reads: 1, edits: 0 })) });

describe('mapLayout', () => {
  it('lays folders out in a 3-column grid without overlap', () => {
    const p = mapLayout({ folders: [folder('a', 10), folder('b', 1), folder('c', 1), folder('d', 1)] });
    expect(p.a).toEqual({ x: 0, y: 0 });
    expect(p.b.x).toBeGreaterThanOrEqual(FOLDER_W);
    expect(p.d.x).toBe(0);
    expect(p.d.y).toBeGreaterThan(0);
  });

  it('scales heat between 0.08 and 0.6', () => {
    expect(heat(0, 10)).toBeCloseTo(0.08);
    expect(heat(10, 10)).toBeCloseTo(0.6);
    expect(heat(1, 0)).toBeCloseTo(0.08);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/web`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/web/graph/replay.ts`:
```ts
import type { Session, Step } from '../../core/model';

export function timelineOf(session: Session): Step[] {
  const keyed: { step: Step; t: number; lane: number; i: number }[] = [];
  session.lanes.forEach((lane, laneIdx) => {
    let last = 0;
    lane.steps.forEach((step, i) => {
      const parsed = step.timestamp ? Date.parse(step.timestamp) : NaN;
      if (!Number.isNaN(parsed)) last = parsed;
      keyed.push({ step, t: last, lane: laneIdx, i });
    });
  });
  keyed.sort((a, b) => a.t - b.t || a.lane - b.lane || a.i - b.i);
  return keyed.map((k) => k.step);
}

export function visibleUpTo(timeline: Step[], cursor: number): Set<string> {
  return new Set(timeline.slice(0, Math.max(0, cursor)).map((s) => s.id));
}
```

`src/web/graph/positions.ts`:
```ts
import type { Positions } from '../../core/model';

export function mergePositions(auto: Positions, saved: Positions): Positions {
  const out: Positions = {};
  for (const id of Object.keys(auto)) out[id] = saved[id] ?? auto[id];
  return out;
}
```

`src/web/graph/mapLayout.ts`:
```ts
import type { Positions, ProjectMap } from '../../core/model';

export const FOLDER_W = 300;
const COLS = 3;
const GAP = 32;
const HEADER_H = 40;
const ROW_H = 22;

export const folderHeight = (fileCount: number) => HEADER_H + fileCount * ROW_H + 12;

export function mapLayout(map: ProjectMap): Positions {
  const out: Positions = {};
  const colY = Array<number>(COLS).fill(0);
  map.folders.forEach((f, i) => {
    const col = i % COLS;
    out[f.path] = { x: col * (FOLDER_W + GAP), y: colY[col] };
    colY[col] += folderHeight(f.files.length) + GAP;
  });
  return out;
}

export function heat(touches: number, max: number): number {
  if (max <= 0) return 0.08;
  return 0.08 + 0.52 * Math.min(1, touches / max);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/graph tests/web
git commit -m "feat(web): replay timeline, saved-position merge, project map grid layout"
```

---

## Task 8: Web shell: API client, session list, details panel, styles (M3, FR-1, FR-17, NFR-6)

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/styles.css`, `src/web/api.ts`, `src/web/useSavedLayout.ts`, `src/web/components/SessionList.tsx`, `src/web/components/DetailsPanel.tsx`
- Create (temporary shell, completed in Task 10): `src/web/App.tsx`

**Interfaces:**
- Consumes: `Session`, `SessionSummary`, `Step`, `Positions` (Task 1).
- Produces:
  - `fetchSessions(): Promise<SessionSummary[]>`; `subscribeSession(id: string, onSession: (s: Session) => void): () => void`; `fetchLayout(id: string, view: 'flow' | 'map'): Promise<Positions>`; `saveLayout(id: string, view: 'flow' | 'map', p: Positions): Promise<void>`
  - `useSavedLayout(sessionId: string | null, view: 'flow' | 'map'): { saved: Positions; savePosition: (nodeId: string, pos: { x: number; y: number }) => void; reset: () => void }`
  - `<SessionList sessions activeId onSelect />`; `<DetailsPanel step onClose />`

- [ ] **Step 1: Vite config and HTML entry**

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4300' } },
});
```

`src/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Session Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/web/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Styles with light/dark tokens**

`src/web/styles.css`:
```css
:root {
  --bg: #f7f7f5; --panel: #ffffff; --ink: #1d1d1b; --muted: #6b6b66; --line: #e2e1dc;
  --accent: #3b5bdb; --user: #3b5bdb; --text: #2f9e44; --thinking: #868e96; --tool: #e8590c; --error: #e03131;
  --read: #3b5bdb; --edit: #e8590c;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: var(--ink); background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #141413; --panel: #1f1f1d; --ink: #ecebe6; --muted: #9a9a93; --line: #34342f; --accent: #748ffc; --user: #748ffc; --text: #69db7c; --thinking: #adb5bd; --tool: #ffa94d; --error: #ff6b6b; --read: #748ffc; --edit: #ffa94d; }
}
* { box-sizing: border-box; }
body { margin: 0; }
.app { display: grid; grid-template-columns: 280px 1fr; grid-template-rows: 1fr auto; height: 100vh; }
.sidebar { grid-row: 1 / 3; border-right: 1px solid var(--line); background: var(--panel); overflow: auto; }
.sidebar input { width: calc(100% - 24px); margin: 12px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
.session-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: none; color: inherit; cursor: pointer; }
.session-item[aria-current='true'] { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.session-item small { display: block; color: var(--muted); margin-top: 2px; }
.main { position: relative; display: flex; flex-direction: column; min-width: 0; }
.toolbar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--panel); }
.toolbar button, .toolbar label { font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); cursor: pointer; }
.toolbar button[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
.canvas { flex: 1; min-height: 0; }
.empty { margin: auto; color: var(--muted); }
.node { width: 260px; min-height: 56px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); border-left: 4px solid var(--kind, var(--muted)); background: var(--panel); color: var(--ink); font-size: 12px; }
.node .kind { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.node .label { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.node.error { border-color: var(--error); box-shadow: 0 0 0 1px var(--error); }
.node.folded { border-style: dashed; cursor: pointer; }
.folder { width: 300px; border-radius: 10px; border: 1px solid var(--line); color: var(--ink); font-size: 12px; overflow: hidden; }
.folder header { padding: 10px; font-weight: 600; }
.folder li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 10px; height: 22px; }
.folder ul { list-style: none; margin: 0 0 12px; padding: 0; }
.badge { font-size: 10px; padding: 0 6px; border-radius: 10px; color: #fff; }
.badge.read { background: var(--read); } .badge.edit { background: var(--edit); }
.details { position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--panel); border-left: 1px solid var(--line); overflow: auto; padding: 16px; z-index: 10; }
.details pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: var(--bg); padding: 8px; border-radius: 6px; }
.replay { grid-column: 2; display: flex; gap: 12px; align-items: center; padding: 8px 12px; border-top: 1px solid var(--line); background: var(--panel); font-size: 12px; }
.replay input { flex: 1; }
```

- [ ] **Step 3: API client and saved-layout hook**

`src/web/api.ts`:
```ts
import type { Positions, Session, SessionSummary } from '../core/model';

export type View = 'flow' | 'map';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const fetchSessions = () => fetch('/api/sessions').then((r) => json<SessionSummary[]>(r));

export function subscribeSession(id: string, onSession: (s: Session) => void): () => void {
  const es = new EventSource(`/api/sessions/${id}/stream`);
  es.addEventListener('session', (e) => onSession(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

export const fetchLayout = (id: string, view: View) => fetch(`/api/layouts/${id}/${view}`).then((r) => json<Positions>(r));

export async function saveLayout(id: string, view: View, positions: Positions): Promise<void> {
  await fetch(`/api/layouts/${id}/${view}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(positions) });
}
```

`src/web/useSavedLayout.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Positions } from '../core/model';
import { fetchLayout, saveLayout, type View } from './api';

export function useSavedLayout(sessionId: string | null, view: View) {
  const [saved, setSaved] = useState<Positions>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSaved({});
    if (sessionId) fetchLayout(sessionId, view).then(setSaved).catch(() => setSaved({}));
  }, [sessionId, view]);

  const persist = useCallback(
    (next: Positions) => {
      clearTimeout(timer.current);
      if (sessionId) timer.current = setTimeout(() => void saveLayout(sessionId, view, next), 400);
    },
    [sessionId, view],
  );

  const savePosition = useCallback(
    (nodeId: string, pos: { x: number; y: number }) =>
      setSaved((prev) => {
        const next = { ...prev, [nodeId]: pos };
        persist(next);
        return next;
      }),
    [persist],
  );

  const reset = useCallback(() => {
    setSaved({});
    persist({});
  }, [persist]);

  return { saved, savePosition, reset };
}
```

- [ ] **Step 4: Session list and details panel**

`src/web/components/SessionList.tsx`:
```tsx
import { useMemo, useState } from 'react';
import type { SessionSummary } from '../../core/model';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const base = (p: string | null) => (p ? p.split('/').filter(Boolean).pop() ?? p : 'unknown project');

export function SessionList({ sessions, activeId, onSelect }: { sessions: SessionSummary[]; activeId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    return sessions.filter((s) => `${s.title ?? ''} ${s.cwd ?? ''} ${s.id}`.toLowerCase().includes(needle));
  }, [sessions, q]);
  return (
    <nav className="sidebar" aria-label="Sessions">
      <input placeholder="Filter sessions" value={q} onChange={(e) => setQ(e.target.value)} />
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

`src/web/components/DetailsPanel.tsx`:
```tsx
import type { Step } from '../../core/model';

export function DetailsPanel({ step, onClose }: { step: Step; onClose: () => void }) {
  return (
    <aside className="details" aria-label="Step details">
      <button onClick={onClose} style={{ float: 'right' }}>Close</button>
      <p className="kind">{step.kind}{step.isError ? ' · error' : ''}{step.laneId !== 'main' ? ` · helper ${step.laneId}` : ''}</p>
      <h3 style={{ marginTop: 4 }}>{step.tool?.name ?? step.label}</h3>
      {step.timestamp && <p>{new Date(step.timestamp).toLocaleString()}</p>}
      {step.tokens && <p>Tokens: {step.tokens.input} in · {step.tokens.output} out · {step.tokens.cacheRead} cached</p>}
      <h4>{step.tool ? 'Input' : 'Content'}</h4>
      <pre>{step.detail}</pre>
      {step.tool && (
        <>
          <h4>Result</h4>
          <pre>{step.tool.result ?? '(no result yet)'}</pre>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Temporary App shell to verify wiring**

`src/web/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import type { Session, SessionSummary } from '../core/model';
import { fetchSessions, subscribeSession } from './api';
import { SessionList } from './components/SessionList';

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);
  useEffect(() => (activeId ? subscribeSession(activeId, setSession) : undefined), [activeId]);
  return (
    <div className="app">
      <SessionList sessions={sessions} activeId={activeId} onSelect={setActiveId} />
      <main className="main">
        <pre style={{ padding: 12 }}>{session ? `${session.title ?? session.id}: ${session.lanes.map((l) => `${l.label} (${l.steps.length})`).join(', ')}` : 'Pick a session'}</pre>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Verify in the browser**

Run (two terminals): `npm run dev:server` and `npm run dev:web`, then open `http://localhost:5173`.
Expected: sidebar lists real sessions with titles; clicking one shows e.g. `Main (120), Code review (14)`; filter box narrows the list. Then run `npx tsc --noEmit && npx vitest run` and expect all pass.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts src/web
git commit -m "feat(web): app shell, API client, session list, details panel, light/dark styles"
```

---

## Task 9: Flow view: render, fold/unfold, follow latest, drag and save (M3, FR-6–10, FR-16)

**Files:**
- Create: `src/web/components/StepNode.tsx`, `src/web/components/FlowView.tsx`

**Interfaces:**
- Consumes: `buildFlowGraph`, `defaultExpandedTurns`, `GraphNode` (Task 6); `autoLayout`, `NODE_W`, `NODE_H` (Task 6); `mergePositions` (Task 7); `useSavedLayout` (Task 8).
- Produces: `<FlowView session visible onSelect follow />` where `visible: Set<string> | null`, `onSelect: (s: Step) => void`, `follow: boolean`; plus a reset button inside its own panel.

- [ ] **Step 1: Node component**

`src/web/components/StepNode.tsx`:
```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { GraphNode } from '../graph/buildFlowGraph';

const KIND_COLOR: Record<string, string> = { user: 'var(--user)', text: 'var(--text)', thinking: 'var(--thinking)', tool: 'var(--tool)', error: 'var(--error)' };

export function StepNode({ data }: NodeProps) {
  const n = data as unknown as GraphNode;
  const kind = n.step?.kind ?? (n.type === 'lane' ? 'helper' : 'turn');
  return (
    <div className={`node${n.isError ? ' error' : ''}${n.type !== 'step' ? ' folded' : ''}`} style={{ '--kind': KIND_COLOR[kind] ?? 'var(--muted)' } as CSSProperties} title={n.type === 'step' ? 'Click for details' : 'Click to expand'}>
      <Handle type="target" position={Position.Top} />
      <div className="kind">{n.type === 'step' ? kind : n.type === 'lane' ? 'helper agent (folded)' : 'turn (folded)'}</div>
      <div className="label">{n.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

- [ ] **Step 2: Flow view**

`src/web/components/FlowView.tsx`:
```tsx
import { Background, Controls, MiniMap, Panel, ReactFlow, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, Step } from '../../core/model';
import { autoLayout, NODE_H, NODE_W } from '../graph/autoLayout';
import { buildFlowGraph, defaultExpandedTurns, turnsOf, type GraphNode } from '../graph/buildFlowGraph';
import { mergePositions } from '../graph/positions';
import { useSavedLayout } from '../useSavedLayout';
import { StepNode } from './StepNode';

const nodeTypes = { sv: StepNode };
const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export function FlowView({ session, visible, onSelect, follow }: { session: Session; visible: Set<string> | null; onSelect: (s: Step) => void; follow: boolean }) {
  const [expandedTurns, setExpandedTurns] = useState(() => defaultExpandedTurns(session));
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const { saved, savePosition, reset } = useSavedLayout(session.id, 'flow');
  const { setCenter } = useReactFlow();

  // Keep newly arriving turns open while live, without re-opening ones the user folded.
  const lastTurnCount = useRef(0);
  useEffect(() => {
    const count = turnsOf(session).length;
    if (lastTurnCount.current > 0 && count > lastTurnCount.current) {
      const latest = defaultExpandedTurns(session, 1);
      setExpandedTurns((prev) => new Set([...prev, ...latest]));
    }
    lastTurnCount.current = count;
  }, [session]);

  const graph = useMemo(() => buildFlowGraph(session, { expandedTurns, collapsedLanes, visible }), [session, expandedTurns, collapsedLanes, visible]);
  const positions = useMemo(() => mergePositions(autoLayout(graph.nodes, graph.edges), saved), [graph, saved]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(graph.nodes.map((n) => ({ id: n.id, type: 'sv', position: positions[n.id], data: n as unknown as Record<string, unknown>, width: NODE_W, height: NODE_H })));
  }, [graph, positions, setNodes]);

  const edges: Edge[] = useMemo(
    () => graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, animated: e.kind === 'spawn', style: e.kind === 'spawn' ? { strokeDasharray: '6 4' } : undefined })),
    [graph],
  );

  const lastId = graph.nodes[graph.nodes.length - 1]?.id;
  useEffect(() => {
    if (!follow || !lastId || !positions[lastId]) return;
    const p = positions[lastId];
    setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1, duration: 300 });
  }, [follow, lastId, positions, setCenter]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => savePosition(node.id, node.position)}
      onNodeClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.type === 'turn') setExpandedTurns((s) => toggle(s, n.id));
        else if (n.type === 'lane') setCollapsedLanes((s) => toggle(s, n.laneId));
        else if (n.step) onSelect(n.step);
      }}
      onNodeDoubleClick={(_, node) => {
        const n = node.data as unknown as GraphNode;
        if (n.step?.laneId && n.step.laneId !== 'main') setCollapsedLanes((s) => toggle(s, n.step!.laneId));
      }}
      fitView
      minZoom={0.1}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
      <Panel position="top-right">
        <button onClick={reset}>Reset layout</button>
      </Panel>
    </ReactFlow>
  );
}
```

- [ ] **Step 3: Wire into App temporarily**

In `src/web/App.tsx` replace the `<pre …>` line with:
```tsx
{session ? (
  <ReactFlowProvider>
    <div className="canvas"><FlowView session={session} visible={null} onSelect={() => {}} follow={false} /></div>
  </ReactFlowProvider>
) : <p className="empty">Pick a session</p>}
```
and add imports `import { ReactFlowProvider } from '@xyflow/react';` and `import { FlowView } from './components/FlowView';`.

- [ ] **Step 4: Verify in the browser against a real session with helpers**

Run: `npm run dev:server` + `npm run dev:web`; open the largest session (it has 19 `Agent` calls).
Expected (check each):
- Older turns appear as dashed "Turn N · X steps" boxes; the last 3 turns are open; clicking a folded turn opens it.
- Helper agents branch off with a dashed animated edge, labelled by their description; double-clicking a helper step folds the branch; clicking the folded box reopens it.
- Failed steps have a red outline.
- Drag a box, reload the page, and the box stays where you put it. "Reset layout" puts it back.
- Run `npx tsc --noEmit && npx vitest run` and expect all pass.

- [ ] **Step 5: Commit**

```bash
git add src/web
git commit -m "feat(web): flow view with folding, helper branches, drag-and-save layout"
```

---

## Task 10: Project map view, replay bar, details, live follow; final App (M4, FR-10, FR-11–13, FR-15, FR-17)

**Files:**
- Create: `src/web/components/FolderNode.tsx`, `src/web/components/MapView.tsx`, `src/web/components/ReplayBar.tsx`
- Modify: `src/web/App.tsx` (full replacement below)

**Interfaces:**
- Consumes: `buildProjectMap` (Task 3); `mapLayout`, `heat`, `FOLDER_W`, `folderHeight` (Task 7); `timelineOf`, `visibleUpTo` (Task 7); `mergePositions` (Task 7); `useSavedLayout`, `fetchSessions`, `subscribeSession` (Task 8); `FlowView` (Task 9); `DetailsPanel`, `SessionList` (Task 8).
- Produces: the complete UI.

- [ ] **Step 1: Folder node and map view**

`src/web/components/FolderNode.tsx`:
```tsx
import type { NodeProps } from '@xyflow/react';
import type { FolderBox } from '../../core/model';

export function FolderNode({ data }: NodeProps) {
  const { folder, heat } = data as unknown as { folder: FolderBox; heat: number };
  return (
    <div className="folder" style={{ background: `color-mix(in srgb, var(--edit) ${Math.round(heat * 100)}%, var(--panel))` }}>
      <header>{folder.path} · {folder.touches}</header>
      <ul>
        {folder.files.map((f) => (
          <li key={f.path} title={f.path}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').pop()}</span>
            <span>
              {f.reads > 0 && <span className="badge read">read {f.reads}</span>} {f.edits > 0 && <span className="badge edit">edit {f.edits}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/web/components/MapView.tsx`:
```tsx
import { Background, Controls, Panel, ReactFlow, useNodesState, type Node } from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import type { Session } from '../../core/model';
import { buildProjectMap } from '../../core/projectMap';
import { folderHeight, FOLDER_W, heat, mapLayout } from '../graph/mapLayout';
import { mergePositions } from '../graph/positions';
import { useSavedLayout } from '../useSavedLayout';
import { FolderNode } from './FolderNode';

const nodeTypes = { folder: FolderNode };

export function MapView({ session, visible }: { session: Session; visible: Set<string> | null }) {
  const map = useMemo(() => buildProjectMap(session, visible), [session, visible]);
  const { saved, savePosition, reset } = useSavedLayout(session.id, 'map');
  const positions = useMemo(() => mergePositions(mapLayout(map), saved), [map, saved]);
  const max = map.folders[0]?.touches ?? 0;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(map.folders.map((f) => ({ id: f.path, type: 'folder', position: positions[f.path], data: { folder: f, heat: heat(f.touches, max) }, width: FOLDER_W, height: folderHeight(f.files.length) })));
  }, [map, positions, max, setNodes]);

  if (map.folders.length === 0) return <p className="empty">No files read or edited yet.</p>;
  return (
    <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeDragStop={(_, n) => savePosition(n.id, n.position)} fitView minZoom={0.1}>
      <Background />
      <Controls />
      <Panel position="top-right">
        <button onClick={reset}>Reset layout</button>
      </Panel>
    </ReactFlow>
  );
}
```

- [ ] **Step 2: Replay bar**

`src/web/components/ReplayBar.tsx`:
```tsx
import type { Step } from '../../core/model';

export function ReplayBar({ timeline, cursor, onChange }: { timeline: Step[]; cursor: number | null; onChange: (c: number | null) => void }) {
  const value = cursor ?? timeline.length;
  const current = timeline[value - 1];
  return (
    <div className="replay">
      <span>{cursor === null ? 'Live' : `Step ${value} / ${timeline.length}`}</span>
      <input type="range" min={0} max={timeline.length} value={value} aria-label="Replay position" onChange={(e) => {
        const v = Number(e.target.value);
        onChange(v >= timeline.length ? null : v);
      }} />
      <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current ? `${current.timestamp ? new Date(current.timestamp).toLocaleTimeString() : ''} ${current.label}` : ''}
      </span>
      {cursor !== null && <button onClick={() => onChange(null)}>Back to live</button>}
    </div>
  );
}
```

- [ ] **Step 3: Final App**

Replace `src/web/App.tsx` entirely:
```tsx
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import type { Session, SessionSummary, Step } from '../core/model';
import { fetchSessions, subscribeSession, type View } from './api';
import { DetailsPanel } from './components/DetailsPanel';
import { FlowView } from './components/FlowView';
import { MapView } from './components/MapView';
import { ReplayBar } from './components/ReplayBar';
import { SessionList } from './components/SessionList';
import { timelineOf, visibleUpTo } from './graph/replay';

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('flow');
  const [cursor, setCursor] = useState<number | null>(null); // null = live (show everything)
  const [selected, setSelected] = useState<Step | null>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => void fetchSessions().then(setSessions).catch(() => setSessions([])), []);
  useEffect(() => {
    setSession(null);
    setCursor(null);
    setSelected(null);
    return activeId ? subscribeSession(activeId, setSession) : undefined;
  }, [activeId]);

  const timeline = useMemo(() => (session ? timelineOf(session) : []), [session]);
  const visible = useMemo(() => (cursor === null ? null : visibleUpTo(timeline, cursor)), [timeline, cursor]);

  return (
    <div className="app">
      <SessionList sessions={sessions} activeId={activeId} onSelect={setActiveId} />
      <main className="main">
        {session ? (
          <>
            <div className="toolbar">
              <strong style={{ marginRight: 'auto' }}>{session.title ?? session.id.slice(0, 8)}</strong>
              <button aria-pressed={view === 'flow'} onClick={() => setView('flow')}>Flow</button>
              <button aria-pressed={view === 'map'} onClick={() => setView('map')}>Project map</button>
              <label><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow latest</label>
            </div>
            <div className="canvas">
              <ReactFlowProvider key={`${session.id}-${view}`}>
                {view === 'flow' ? (
                  <FlowView session={session} visible={visible} onSelect={setSelected} follow={follow && cursor === null} />
                ) : (
                  <MapView session={session} visible={visible} />
                )}
              </ReactFlowProvider>
            </div>
            {selected && <DetailsPanel step={selected} onClose={() => setSelected(null)} />}
          </>
        ) : (
          <p className="empty">{activeId ? 'Loading…' : 'Pick a session on the left.'}</p>
        )}
      </main>
      {session && <ReplayBar timeline={timeline} cursor={cursor} onChange={setCursor} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify in the browser (all M3/M4 stories)**

Run: `npm run dev:server` + `npm run dev:web`. Check each:
- **US-1/FR-6:** a past session renders as a top-to-bottom flow.
- **US-2/FR-10/FR-14:** start a new Claude Code session in another terminal, open it in the viewer, ask Claude something. New boxes appear within ~2 s and the view pans to them with "Follow latest" on.
- **US-4/FR-11–13:** Project map tab shows folder boxes with read/edit badges; the busiest folder is the most strongly shaded; `/etc` or `~/.claude` paths sit in "(outside project)".
- **US-5/FR-15:** drag the slider back. Both tabs shrink to that moment. "Back to live" restores everything.
- **US-6/FR-16:** drag boxes in both tabs, reload, and positions persist. Check `ls ~/.session-viewer/layouts`.
- **US-7/FR-17:** click a tool step. The panel shows input JSON, result, tokens.
- Then `npx tsc --noEmit && npx vitest run`: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/web
git commit -m "feat(web): project map view, replay bar, details panel and live follow"
```

---

## Task 11: Build, README, ship-to-self check (M5, NFR-1, NFR-3)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Production build and run**

Run: `npm run build && node dist/cli.js --port 4302`
Expected: browser opens `http://127.0.0.1:4302`, full UI works from `dist/web` (no Vite running).

Run: `lsof -iTCP:4302 -sTCP:LISTEN`
Expected: listening on `127.0.0.1` / `localhost` only, not `*` (NFR-1).

- [ ] **Step 2: Performance check (NFR-3)**

Open the largest session (`ls -S ~/.claude/projects/*/*.jsonl | head -1`). Time from click to diagram < 2 s. Expand 5 folded turns and drag around: it should stay smooth. If not, record it in the README "Known limits" and open an issue. Don't optimise in v1.

- [ ] **Step 3: Write README**

`README.md`:
```markdown
# Session Viewer

See your Claude Code sessions as a picture: live, replayable, and arrangeable.

    npx session-viewer

- **Flow view:** every step in order, with helper agents branching off and older turns folded.
- **Project map:** which folders and files the agent read or edited, shaded by activity.
- **Live:** new steps appear within ~2 seconds.
- **Replay:** drag the slider to see the session at any moment.
- **Arrange:** drag boxes; your layout is saved per session.

## Private by design
Runs only on `127.0.0.1`, reads `~/.claude/projects` on your machine, and makes no network calls. Layouts are saved to `~/.session-viewer/layouts`.

## Options
`--port 4300` · `--root <path to Claude projects>` · `--no-open`

## Known limits (v1)
Claude Code only. Files touched via shell commands (`Bash`) aren't shown on the project map. Claude Code's log format is undocumented and may change.

## Develop
    npm install
    npm run dev:server   # API on :4300
    npm run dev:web      # UI on :5173
    npm test
```

- [ ] **Step 4: Five-session check**

Open 5 real sessions of different kinds (short Q&A, long build, heavy helper-agent use, one with errors, one still running). For each, note in `docs/v1-check.md` whether flow, map, replay and helpers looked right. Fix any crash before calling v1 done; log cosmetic issues as v1.x.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/v1-check.md
git commit -m "docs: README and v1 five-session check"
```

---

## Self-review (done while writing)

- **Spec coverage:** FR-1 → T3/T8; FR-2 → T2; FR-3/4/5 → T1; FR-6/7/8/9 → T6+T9; FR-10 → T9+T10; FR-11/12 → T3; FR-13 → T7+T10; FR-14 → T4; FR-15 → T7+T10; FR-16 → T4+T8+T9+T10; FR-17 → T8+T10; FR-18 → T5; NFR-1 → T5 (hostname) + T11 check; NFR-2 → T3/T4 tests; NFR-3 → T6 folding + T11 check; NFR-4 → T1/T2 file boundaries; NFR-5 → `engines` in T1; NFR-6 → T8 CSS.
- **Placeholders:** none. Every code step has full code.
- **Type consistency:** `Positions`, `Step`, `Session`, `GraphNode`, `View` names match across tasks; `visible` is `Set<string> | null` everywhere; `cursor` = count of shown steps, `null` = live.
- **Review Focus:** all five lines have tests in their owning tasks (T1, T4, T2, T6, T4).
