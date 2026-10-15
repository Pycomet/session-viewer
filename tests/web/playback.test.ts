import { describe, expect, it } from 'vitest';
import { playbackCursor } from '../../src/web/quest/playback';

describe('playbackCursor', () => {
  it('starts at 0, grows evenly, and ends (null) at the duration', () => {
    expect(playbackCursor(0, 20, 10000)).toBe(0);
    expect(playbackCursor(5000, 20, 10000)).toBe(10);
    expect(playbackCursor(9999, 20, 10000)).toBe(19);
    expect(playbackCursor(10000, 20, 10000)).toBeNull();
    expect(playbackCursor(99999, 20, 10000)).toBeNull();
  });

  it('is safe with no steps or a negative clock', () => {
    expect(playbackCursor(100, 0, 10000)).toBeNull();
    expect(playbackCursor(-50, 20, 10000)).toBe(0);
  });
});
