import { appendFile, mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSessionDir, HEAD_BYTES, listSessions, readEnds, sessionFingerprint, TAIL_BYTES } from '../../src/core/discover';
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

  it('reads only the start and end of big logs, still finding cwd and the latest title', async () => {
    const r = await mkdtemp(join(tmpdir(), 'sv-big-'));
    await mkdir(join(r, '-proj'));
    const filler = toLines(Array.from({ length: 6000 }, () => userText('x'.repeat(500)))).join('\n'); // ~3 MB
    const early = toLines([userText('start'), { type: 'ai-title', aiTitle: 'Early title' }]).join('\n');
    await writeFile(join(r, '-proj', `${A}.jsonl`), [early, filler, toLines([{ type: 'ai-title', aiTitle: 'Late title' }])[0]].join('\n'));
    await writeFile(join(r, '-proj', `${B}.jsonl`), [early, filler].join('\n'));
    const byId = Object.fromEntries((await listSessions(r)).map((s) => [s.id, s]));
    expect(byId[A]).toMatchObject({ cwd: '/proj', title: 'Late title' });
    expect(byId[B]).toMatchObject({ cwd: '/proj', title: 'Early title' });
    const text = await readEnds(join(r, '-proj', `${A}.jsonl`));
    expect(text.length).toBeLessThanOrEqual(HEAD_BYTES + TAIL_BYTES + 1);
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
