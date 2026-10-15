import { describe, expect, it } from 'vitest';
import { parseLog } from '../../src/core/parse';
import { assistantBlocks, toLines, toolResult, toolUse, userText } from '../helpers/records';

describe('parseLog', () => {
  it('turns user text, agent text and a tool call into steps with the result attached', () => {
    const { steps } = parseLog(
      toLines([
        userText('fix the login bug'),
        assistantBlocks([{ type: 'text', text: 'Looking now' }, toolUse('t1', 'Read', { file_path: '/proj/src/login.ts' })]),
        toolResult('t1', 'file contents'),
      ]),
      'main',
    );
    expect(steps.map((s) => s.kind)).toEqual(['user', 'text', 'tool']);
    expect(steps[2].tool).toMatchObject({ name: 'Read', useId: 't1', result: 'file contents' });
    expect(steps[2].label).toBe('Read: /proj/src/login.ts');
    expect(steps.every((s) => s.laneId === 'main')).toBe(true);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('skips blank, malformed and half-written lines', () => {
    const good = toLines([userText('hi')]);
    const { steps } = parseLog(['', 'not json', ...good, '{"type":"assistant","mess'], 'main');
    expect(steps).toHaveLength(1);
  });

  it('turns unknown content blocks into unknown steps and ignores unknown record types', () => {
    const { steps } = parseLog(
      toLines([{ type: 'queue-operation', sessionId: 'x' }, assistantBlocks([{ type: 'hologram', data: 1 }])]),
      'main',
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'unknown', label: '[hologram]' });
  });

  it('counts tokens once per API request', () => {
    const a = assistantBlocks([{ type: 'text', text: 'one' }]);
    const b = { ...assistantBlocks([{ type: 'text', text: 'two' }]), requestId: a.requestId };
    const { steps } = parseLog(toLines([a, b]), 'main');
    expect(steps[0].tokens).toEqual({ input: 10, output: 5, cacheRead: 100 });
    expect(steps[1].tokens).toBeNull();
  });

  it('flags failed tool results and API errors', () => {
    const { steps } = parseLog(
      toLines([
        assistantBlocks([toolUse('t1', 'Bash', { command: 'npm test' })]),
        toolResult('t1', 'exit 1', true),
        assistantBlocks([{ type: 'text', text: 'API Error: overloaded' }], 3, { isApiErrorMessage: true }),
      ]),
      'main',
    );
    expect(steps[0].isError).toBe(true);
    expect(steps[1]).toMatchObject({ kind: 'error', isError: true });
  });

  it('reads cwd and the latest ai-title, and skips meta user records', () => {
    const parsed = parseLog(
      toLines([
        { type: 'ai-title', aiTitle: 'First' },
        userText('<system-reminder>x</system-reminder>', 0, { isMeta: true }),
        userText('hello'),
        { type: 'ai-title', aiTitle: 'Fix login bug' },
      ]),
      'main',
    );
    expect(parsed.cwd).toBe('/proj');
    expect(parsed.title).toBe('Fix login bug');
    expect(parsed.steps).toHaveLength(1);
  });
});
