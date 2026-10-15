import type { Positions } from '../../core/model';

export function mergePositions(auto: Positions, saved: Positions): Positions {
  const out: Positions = {};
  for (const id of Object.keys(auto)) out[id] = saved[id] ?? auto[id];
  return out;
}
