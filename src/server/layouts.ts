import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Positions } from '../core/model';

export function isPositions(v: unknown): v is Positions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every(
    (p) => p && typeof p === 'object' && Number.isFinite((p as any).x) && Number.isFinite((p as any).y),
  );
}

export async function readLayout(dir: string, key: string): Promise<Positions> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8'));
    return isPositions(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeLayout(dir: string, key: string, positions: Positions): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), JSON.stringify(positions));
}
