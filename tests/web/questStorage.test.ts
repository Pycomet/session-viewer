import { describe, expect, it } from 'vitest';
import { FRESH_QUEST } from '../../src/web/quest/quest';
import { loadQuest, QUEST_KEY, saveQuest, type QuestStore } from '../../src/web/quest/storage';

const memory = (): QuestStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('quest storage', () => {
  it('round-trips state', () => {
    const store = memory();
    saveQuest({ started: true, done: ['map', 'step'], dismissed: false }, store);
    expect(loadQuest(store)).toEqual({ started: true, done: ['map', 'step'], dismissed: false });
  });

  it('gives a fresh state for missing, corrupt or wrongly shaped data', () => {
    const store = memory();
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
    store.data.set(QUEST_KEY, '{oops');
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
    store.data.set(QUEST_KEY, JSON.stringify({ started: 'yes', done: 'all' }));
    expect(loadQuest(store)).toEqual(FRESH_QUEST);
  });

  it('drops unknown item ids', () => {
    const store = memory();
    store.data.set(QUEST_KEY, JSON.stringify({ started: true, done: ['map', 'fly'], dismissed: false }));
    expect(loadQuest(store).done).toEqual(['map']);
  });

  it('survives a storage that throws (blocked in a private window)', () => {
    const angry: QuestStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadQuest(angry)).toEqual(FRESH_QUEST);
    expect(() => saveQuest(FRESH_QUEST, angry)).not.toThrow();
    expect(loadQuest(null)).toEqual(FRESH_QUEST);
  });
});
