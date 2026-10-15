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
