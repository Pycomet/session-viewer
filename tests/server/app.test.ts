import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';
import { toLines, userText } from '../helpers/records';

const ID = 'aaaaaaaa-0000-0000-0000-000000000001';

async function app() {
  const root = await mkdtemp(join(tmpdir(), 'sv-app-'));
  await mkdir(join(root, '-proj'));
  await writeFile(join(root, '-proj', `${ID}.jsonl`), toLines([userText('hello')]).join('\n'));
  const webDir = await mkdtemp(join(tmpdir(), 'sv-web-'));
  await writeFile(join(webDir, 'index.html'), '<html>viewer</html>');
  return createApp({ root, layoutsDir: join(root, '.layouts'), webDir, pollMs: 50 });
}

describe('app', () => {
  it('lists sessions', async () => {
    const res = await (await app()).request('/api/sessions');
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe(ID);
  });

  it('serves one session', async () => {
    const res = await (await app()).request(`/api/sessions/${ID}`);
    expect((await res.json()).lanes[0].steps[0].label).toBe('hello');
  });

  it('rejects non-uuid ids', async () => {
    expect((await (await app()).request('/api/sessions/..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
  });

  it('404s unknown uuid', async () => {
    expect((await (await app()).request('/api/sessions/bbbbbbbb-0000-0000-0000-000000000009')).status).toBe(404);
  });

  it('streams the session immediately over SSE', async () => {
    const res = await (await app()).request(`/api/sessions/${ID}/stream`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: session');
    expect(text).toContain('hello');
    await reader.cancel();
  });

  it('saves and returns layouts', async () => {
    const a = await app();
    const put = await a.request(`/api/layouts/${ID}/flow`, { method: 'PUT', body: JSON.stringify({ n: { x: 1, y: 2 } }), headers: { 'content-type': 'application/json' } });
    expect(put.status).toBe(204);
    expect(await (await a.request(`/api/layouts/${ID}/flow`)).json()).toEqual({ n: { x: 1, y: 2 } });
  });

  it('rejects invalid layout bodies and views', async () => {
    const a = await app();
    expect((await a.request(`/api/layouts/${ID}/flow`, { method: 'PUT', body: '"nope"' })).status).toBe(400);
    expect((await a.request(`/api/layouts/${ID}/other`)).status).toBe(400);
  });

  it('rejects requests whose Host is not localhost (DNS rebinding)', async () => {
    const a = await app();
    expect((await a.request('/api/sessions', { headers: { host: 'evil.example:4300' } })).status).toBe(403);
    expect((await a.request('/', { headers: { host: 'evil.example' } })).status).toBe(403);
    expect((await a.request('/', { headers: { host: 'bad host' } })).status).toBe(403);
    expect((await a.request('/api/sessions', { headers: { host: '127.0.0.1:4300' } })).status).toBe(200);
    expect((await a.request('/api/sessions', { headers: { host: 'localhost:5173' } })).status).toBe(200);
  });

  it('serves the web app with index.html fallback and blocks traversal', async () => {
    const a = await app();
    expect(await (await a.request('/')).text()).toContain('viewer');
    expect(await (await a.request('/some/route')).text()).toContain('viewer');
    expect(await (await a.request('/..%2F..%2Fetc%2Fpasswd')).text()).toContain('viewer');
  });
});
