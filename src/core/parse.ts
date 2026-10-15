import type { Step, Tokens } from './model';

// All knowledge of Claude Code's JSONL record format lives here and in load.ts (PRD NFR-4, Appendix A).

const LABEL_MAX = 140;
const DETAIL_MAX = 20_000;
const INPUT_KEYS = ['description', 'command', 'file_path', 'notebook_path', 'pattern', 'query', 'url', 'skill', 'prompt'];

export interface ParsedLog {
  steps: Step[];
  cwd: string | null;
  title: string | null;
}

type Rec = Record<string, any>;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const label = (s: string) => clip(oneLine(s), LABEL_MAX);
const detail = (s: string) => clip(s, DETAIL_MAX);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (c && typeof c === 'object' && typeof (c as Rec).text === 'string' ? (c as Rec).text : ''))
    .filter(Boolean)
    .join('\n');
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  for (const key of INPUT_KEYS) {
    if (typeof input[key] === 'string') return label(`${name}: ${input[key]}`);
  }
  return name;
}

function tokensOf(rec: Rec): Tokens | null {
  const u = rec.message?.usage;
  if (!u || typeof u !== 'object') return null;
  return {
    input: Number(u.input_tokens) || 0,
    output: Number(u.output_tokens) || 0,
    cacheRead: Number(u.cache_read_input_tokens) || 0,
  };
}

export function parseLog(lines: string[], laneId: string): ParsedLog {
  const steps: Step[] = [];
  const byUseId = new Map<string, Step>();
  const seenRequests = new Set<string>();
  let cwd: string | null = null;
  let title: string | null = null;

  const push = (s: Omit<Step, 'index' | 'laneId' | 'tokens' | 'spawnsLaneId'> & Partial<Pick<Step, 'tokens'>>) => {
    const step: Step = { tokens: null, spawnsLaneId: null, ...s, index: steps.length, laneId };
    steps.push(step);
    return step;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let rec: Rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // malformed or half-written (live session mid-write)
    }
    if (!rec || typeof rec !== 'object') continue;
    if (!cwd && typeof rec.cwd === 'string') cwd = rec.cwd;
    if (rec.type === 'ai-title' && typeof rec.aiTitle === 'string') {
      title = rec.aiTitle;
      continue;
    }
    if (rec.isMeta === true) continue;

    const timestamp = typeof rec.timestamp === 'string' ? rec.timestamp : null;
    const uuid = typeof rec.uuid === 'string' ? rec.uuid : `line${steps.length}`;
    const content = rec.message?.content;

    if (rec.type === 'user') {
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type !== 'tool_result') continue;
          const target = byUseId.get(block.tool_use_id);
          if (!target?.tool) continue;
          target.tool.result = detail(textOf(block.content));
          if (block.is_error === true) target.isError = true;
        }
      }
      const text = textOf(content);
      if (text.trim()) {
        push({ id: uuid, kind: 'user', timestamp, label: label(text), detail: detail(text), isError: false, tool: null });
      }
      continue;
    }

    if (rec.type !== 'assistant') continue;

    let tokens: Tokens | null = null;
    const requestId = typeof rec.requestId === 'string' ? rec.requestId : uuid;
    if (!seenRequests.has(requestId)) {
      seenRequests.add(requestId);
      tokens = tokensOf(rec);
    }
    const takeTokens = () => {
      const t = tokens;
      tokens = null;
      return t;
    };

    if (rec.isApiErrorMessage === true) {
      const text = textOf(content) || 'API error';
      push({ id: uuid, kind: 'error', timestamp, label: label(text), detail: detail(text), isError: true, tool: null, tokens: takeTokens() });
      continue;
    }

    const blocks: Rec[] = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
    blocks.forEach((block, i) => {
      const id = `${uuid}#${i}`;
      const base = { id, timestamp, isError: false, tool: null, tokens: takeTokens() };
      if (block?.type === 'text') {
        if (!String(block.text ?? '').trim()) return;
        push({ ...base, kind: 'text', label: label(block.text), detail: detail(block.text) });
      } else if (block?.type === 'thinking') {
        const t = String(block.thinking ?? '');
        push({ ...base, kind: 'thinking', label: label(t || 'thinking'), detail: detail(t) });
      } else if (block?.type === 'tool_use') {
        const name = String(block.name ?? 'tool');
        const input: Record<string, unknown> = block.input && typeof block.input === 'object' ? block.input : {};
        const step = push({
          ...base,
          kind: 'tool',
          label: toolLabel(name, input),
          detail: detail(JSON.stringify(input, null, 2)),
          tool: { name, useId: String(block.id ?? id), input, result: null },
        });
        byUseId.set(step.tool!.useId, step);
      } else {
        const type = String(block?.type ?? 'unknown');
        push({ ...base, kind: 'unknown', label: `[${type}]`, detail: detail(JSON.stringify(block, null, 2)) });
      }
    });
  }

  return { steps, cwd, title };
}
