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
