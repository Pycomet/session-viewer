import type { FileTouch, FolderBox, ProjectMap, Session } from './model';

// No node: imports here, because this module is also bundled into the browser (MapView).
export const OUTSIDE = '(outside project)';
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const DEPTH = 2;

function locate(abs: string, cwd: string | null): { folder: string; path: string } {
  if (!cwd || !abs.startsWith(cwd.replace(/\/$/, '') + '/')) return { folder: OUTSIDE, path: abs };
  const rel = abs.slice(cwd.replace(/\/$/, '').length + 1);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
  return { folder: dir === '.' ? '.' : dir.split('/').slice(0, DEPTH).join('/'), path: rel };
}

export function buildProjectMap(session: Session, visible: Set<string> | null = null): ProjectMap {
  const folders = new Map<string, Map<string, FileTouch>>();
  for (const step of session.lanes.flatMap((l) => l.steps)) {
    if (visible && !visible.has(step.id)) continue;
    const name = step.tool?.name;
    if (!name || !(READ_TOOLS.has(name) || EDIT_TOOLS.has(name))) continue;
    const input = step.tool!.input;
    const abs = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null;
    if (!abs) continue;
    const { folder, path } = locate(abs, session.cwd);
    const files = folders.get(folder) ?? new Map<string, FileTouch>();
    folders.set(folder, files);
    const touch = files.get(path) ?? { path, reads: 0, edits: 0 };
    files.set(path, touch);
    if (EDIT_TOOLS.has(name)) touch.edits++;
    else touch.reads++;
  }
  const total = (f: FileTouch) => f.reads + f.edits;
  const boxes: FolderBox[] = [...folders].map(([path, files]) => {
    const list = [...files.values()].sort((a, b) => total(b) - total(a) || a.path.localeCompare(b.path));
    return { path, files: list, touches: list.reduce((n, f) => n + total(f), 0) };
  });
  boxes.sort((a, b) => b.touches - a.touches || a.path.localeCompare(b.path));
  return { folders: boxes };
}
