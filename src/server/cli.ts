#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import open from 'open';
import { createApp } from './app';

export function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string', default: '4300' },
      root: { type: 'string', default: join(homedir(), '.claude', 'projects') },
      'no-open': { type: 'boolean', default: false },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid --port: ${values.port}`);
  return { port, root: resolve(values.root!), open: !values['no-open'] };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
  const app = createApp({
    root: args.root,
    layoutsDir: join(homedir(), '.session-viewer', 'layouts'),
    webDir: existsSync(join(webDir, 'index.html')) ? webDir : null,
  });
  serve({ fetch: app.fetch, port: args.port, hostname: '127.0.0.1' }, ({ port }) => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Session Viewer running at ${url} (reading ${args.root}). Local only, nothing leaves this machine.`);
    if (args.open) void open(url);
  });
}

// npx runs us through a symlink in node_modules/.bin, so compare real paths.
const entry = process.argv[1] && existsSync(process.argv[1]) ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === entry) main();
