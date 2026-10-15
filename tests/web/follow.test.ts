import { describe, expect, it } from 'vitest';
import { followTarget } from '../../src/web/graph/follow';

describe('followTarget', () => {
  it('moves only when a new newest node appears', () => {
    expect(followTarget('a', 'b', true)).toBe('b');
    expect(followTarget('b', 'b', true)).toBeNull(); // drag / fold / unfold: same newest node, stay put
  });

  it('does nothing when follow is off or the graph is empty', () => {
    expect(followTarget('a', 'b', false)).toBeNull();
    expect(followTarget('a', undefined, true)).toBeNull();
  });

  it('jumps to the newest node when follow is switched back on', () => {
    expect(followTarget(null, 'b', true)).toBe('b');
  });
});
