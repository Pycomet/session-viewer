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
