import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { findSessionDir, listSessions, SESSION_ID_RE, sessionFingerprint } from '../core/discover';
import { loadSession } from '../core/load';
import { isPositions, readLayout, writeLayout } from './layouts';

export interface AppOptions {
  root: string;
  layoutsDir: string;
  webDir: string | null;
  pollMs?: number;
}

const VIEWS = new Set(['flow', 'map']);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export function createApp({ root, layoutsDir, webDir, pollMs = 1000 }: AppOptions): Hono {
  const app = new Hono();

  const resolveSession = async (id: string) => (SESSION_ID_RE.test(id) ? { dir: await findSessionDir(root, id) } : null);

  app.get('/api/sessions', async (c) => c.json(await listSessions(root)));

  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const found = await resolveSession(id);
    if (!found) return c.json({ error: 'invalid id' }, 400);
    if (!found.dir) return c.json({ error: 'not found' }, 404);
    return c.json(await loadSession(found.dir, id));
  });

  app.get('/api/sessions/:id/stream', async (c) => {
    const id = c.req.param('id');
    const found = await resolveSession(id);
    if (!found) return c.json({ error: 'invalid id' }, 400);
    if (!found.dir) return c.json({ error: 'not found' }, 404);
    const dir = found.dir;
    return streamSSE(c, async (stream) => {
      let open = true;
      let last = '';
      stream.onAbort(() => {
        open = false;
      });
      while (open) {
        const fp = await sessionFingerprint(dir, id);
        if (fp !== last) {
          last = fp;
          await stream.writeSSE({ event: 'session', data: JSON.stringify(await loadSession(dir, id)) });
        }
        await stream.sleep(pollMs);
      }
    });
  });

  app.on(['GET', 'PUT'], '/api/layouts/:id/:view', async (c) => {
    const { id, view } = c.req.param();
    if (!SESSION_ID_RE.test(id) || !VIEWS.has(view)) return c.json({ error: 'invalid' }, 400);
    const key = `${id}.${view}`;
    if (c.req.method === 'GET') return c.json(await readLayout(layoutsDir, key));
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    if (!isPositions(body)) return c.json({ error: 'invalid layout' }, 400);
    await writeLayout(layoutsDir, key, body);
    return c.body(null, 204);
  });

  app.get('*', async (c) => {
    if (!webDir) return c.text('Web UI not built. Run `npm run dev:web` or `npm run build`.', 404);
    const base = normalize(webDir + sep);
    const requested = normalize(join(webDir, decodeURIComponent(new URL(c.req.url).pathname)));
    const candidates = requested.startsWith(base) && extname(requested) ? [requested, join(webDir, 'index.html')] : [join(webDir, 'index.html')];
    for (const file of candidates) {
      try {
        const body = await readFile(file);
        return c.body(body, 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      } catch {
        /* try next */
      }
    }
    return c.text('Not found', 404);
  });

  return app;
}
