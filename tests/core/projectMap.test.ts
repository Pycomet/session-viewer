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
    const map = buildProjectMap(session([a, b, bash]), new Set([a.id, bash.id]));
    expect(map.folders).toEqual([{ path: '.', files: [{ path: 'a.ts', reads: 1, edits: 0 }], touches: 1 }]);
  });
});
