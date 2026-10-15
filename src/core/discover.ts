import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionSummary } from './model';
import { subagentDir } from './load';

export const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

// The session list only needs cwd (in the first records) and the latest ai-title (re-written near the end),
// so read a bounded window from each end instead of whole logs that can be tens of MB.
export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 256 * 1024;

export async function readEnds(path: string): Promise<string> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const read = async (position: number, length: number) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await file.read(buf, 0, length, position);
      return buf.subarray(0, bytesRead).toString('utf8');
    };
    if (size <= HEAD_BYTES + TAIL_BYTES) return read(0, size);
    // The newline keeps the two cut-off partial lines apart; quickMeta skips them as unparseable.
    return `${await read(0, HEAD_BYTES)}\n${await read(size - TAIL_BYTES, TAIL_BYTES)}`;
  } finally {
    await file.close();
  }
}

function quickMeta(text: string): { cwd: string | null; title: string | null } {
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of text.split('\n')) {
    const wantsCwd = !cwd && line.includes('"cwd"');
    const isTitle = line.includes('"ai-title"');
    if (!wantsCwd && !isTitle) continue;
    try {
      const rec = JSON.parse(line);
      if (wantsCwd && typeof rec.cwd === 'string') cwd = rec.cwd;
      if (rec.type === 'ai-title' && typeof rec.aiTitle === 'string') title = rec.aiTitle;
    } catch {
      /* half-written line */
    }
  }
  return { cwd, title };
}

export async function listSessions(root: string, limit = 200): Promise<SessionSummary[]> {
  const found: { id: string; projectDir: string; mtime: Date; size: number }[] = [];
  for (const project of await safeReaddir(root)) {
    const projectDir = join(root, project);
    for (const file of await safeReaddir(projectDir)) {
      const id = file.replace(/\.jsonl$/, '');
      if (!file.endsWith('.jsonl') || !SESSION_ID_RE.test(id)) continue;
      const s = await stat(join(projectDir, file));
      found.push({ id, projectDir, mtime: s.mtime, size: s.size });
    }
  }
  found.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return Promise.all(
    found.slice(0, limit).map(async (f) => ({
      id: f.id,
      projectDir: f.projectDir,
      updatedAt: f.mtime.toISOString(),
      sizeBytes: f.size,
      ...quickMeta(await readEnds(join(f.projectDir, `${f.id}.jsonl`))),
    })),
  );
}

export async function findSessionDir(root: string, id: string): Promise<string | null> {
  if (!SESSION_ID_RE.test(id)) return null;
  for (const project of await safeReaddir(root)) {
    const projectDir = join(root, project);
    if ((await safeReaddir(projectDir)).includes(`${id}.jsonl`)) return projectDir;
  }
  return null;
}

export async function sessionFingerprint(projectDir: string, id: string): Promise<string> {
  const parts: string[] = [];
  const add = async (path: string) => {
    try {
      const s = await stat(path);
      parts.push(`${path}:${s.size}:${s.mtimeMs}`);
    } catch {
      /* file vanished */
    }
  };
  await add(join(projectDir, `${id}.jsonl`));
  const sub = subagentDir(projectDir, id);
  for (const f of (await safeReaddir(sub)).sort()) await add(join(sub, f));
  return parts.join('|');
}
