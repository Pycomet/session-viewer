// Which node "Follow latest" should move to, given the node it last moved to (null = never / follow was off).
// Returns null when the view should stay put, so dragging or folding never yanks the camera.
export function followTarget(lastCentered: string | null, newest: string | undefined, follow: boolean): string | null {
  if (!follow || !newest || newest === lastCentered) return null;
  return newest;
}
