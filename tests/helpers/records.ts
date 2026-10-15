let n = 0;
export const uid = () => `u${++n}`;

const ts = (s: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, s)).toISOString();

export function userText(text: string, sec = 0, extra: Record<string, unknown> = {}) {
  return { type: 'user', uuid: uid(), timestamp: ts(sec), cwd: '/proj', message: { role: 'user', content: text }, ...extra };
}

export function assistantBlocks(blocks: unknown[], sec = 1, extra: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    uuid: uid(),
    timestamp: ts(sec),
    cwd: '/proj',
    requestId: `req_${uid()}`,
    message: { role: 'assistant', content: blocks, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 } },
    ...extra,
  };
}

export const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input });

export function toolResult(useId: string, content: string, isError = false, sec = 2) {
  return {
    type: 'user',
    uuid: uid(),
    timestamp: ts(sec),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: useId, content, is_error: isError }] },
  };
}

export const toLines = (recs: unknown[]) => recs.map((r) => JSON.stringify(r));
