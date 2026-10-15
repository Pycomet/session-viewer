import type { Positions, ProjectMap } from '../../core/model';

export const FOLDER_W = 300;
const COLS = 3;
const GAP = 32;
const HEADER_H = 40;
const ROW_H = 22;

export const folderHeight = (fileCount: number) => HEADER_H + fileCount * ROW_H + 12;

export function mapLayout(map: ProjectMap): Positions {
  const out: Positions = {};
  const colY = Array<number>(COLS).fill(0);
  map.folders.forEach((f, i) => {
    const col = i % COLS;
    out[f.path] = { x: col * (FOLDER_W + GAP), y: colY[col] };
    colY[col] += folderHeight(f.files.length) + GAP;
  });
  return out;
}

export function heat(touches: number, max: number): number {
  if (max <= 0) return 0.08;
  return 0.08 + 0.52 * Math.min(1, touches / max);
}
