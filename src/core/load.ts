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
