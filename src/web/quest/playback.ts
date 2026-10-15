export const PLAYBACK_MS = 15_000;

// How many steps the demo playback shows after elapsedMs, or null once it has finished.
export function playbackCursor(elapsedMs: number, total: number, durationMs = PLAYBACK_MS): number | null {
  if (total <= 0 || elapsedMs >= durationMs) return null;
  return Math.floor((Math.max(0, elapsedMs) / durationMs) * total);
}
