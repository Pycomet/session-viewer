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
