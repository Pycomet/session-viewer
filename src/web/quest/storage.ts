import { FRESH_QUEST, QUEST_ITEMS, type QuestItemId, type QuestState } from './quest';

export const QUEST_KEY = 'sv.quest.v1';
export type QuestStore = Pick<Storage, 'getItem' | 'setItem'>;

const IDS = new Set<string>(QUEST_ITEMS.map((i) => i.id));

function browserStore(): QuestStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadQuest(store: QuestStore | null = browserStore()): QuestState {
  try {
    const raw = store?.getItem(QUEST_KEY);
    if (!raw) return FRESH_QUEST;
    const v = JSON.parse(raw);
    if (typeof v?.started !== 'boolean' || typeof v?.dismissed !== 'boolean' || !Array.isArray(v?.done)) return FRESH_QUEST;
    return { started: v.started, dismissed: v.dismissed, done: v.done.filter((id: unknown): id is QuestItemId => typeof id === 'string' && IDS.has(id)) };
  } catch {
    return FRESH_QUEST;
  }
}

export function saveQuest(state: QuestState, store: QuestStore | null = browserStore()): void {
  try {
    store?.setItem(QUEST_KEY, JSON.stringify(state));
  } catch {
    /* blocked storage: the quest just won't be remembered */
  }
}
