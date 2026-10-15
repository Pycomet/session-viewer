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
