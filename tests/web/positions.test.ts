import { describe, expect, it } from 'vitest';
import { mergePositions } from '../../src/web/graph/positions';

describe('mergePositions', () => {
  it('prefers saved positions only for nodes that still exist', () => {
    expect(mergePositions({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, { b: { x: 9, y: 9 }, gone: { x: 5, y: 5 } })).toEqual({ a: { x: 0, y: 0 }, b: { x: 9, y: 9 } });
  });
});
