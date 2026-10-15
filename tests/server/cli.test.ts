import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../src/server/cli';

describe('parseCliArgs', () => {
  it('has sensible defaults', () => {
    expect(parseCliArgs([])).toEqual({ port: 4300, root: join(homedir(), '.claude', 'projects'), open: true });
  });

  it('reads flags', () => {
    expect(parseCliArgs(['--port', '5000', '--root', '/tmp/x', '--no-open'])).toEqual({ port: 5000, root: '/tmp/x', open: false });
  });

  it('rejects a bad port', () => {
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow(/port/);
  });
});
