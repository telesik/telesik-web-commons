// @vitest-environment jsdom
// Хранилище: localStorage по умолчанию, тихая запись, сейв матча в конверте.
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore, matchSave, removeQuietly, writeJson, type KVStore } from '../src/store';

function memStore(initial: Record<string, string> = {}): KVStore & { mem: Map<string, string>; reads: number } {
  const mem = new Map(Object.entries(initial));
  const s = {
    mem,
    reads: 0,
    get: (k: string) => {
      s.reads++;
      return mem.get(k) ?? null;
    },
    set: (k: string, v: string) => void mem.set(k, v),
    remove: (k: string) => void mem.delete(k),
  };
  return s;
}

const broken: KVStore = {
  get: () => {
    throw new Error('нет доступа');
  },
  set: () => {
    throw new Error('квота');
  },
  remove: () => {
    throw new Error('нет доступа');
  },
};

interface Save {
  readonly n: number;
}
const validate = (raw: unknown): Save | null =>
  typeof raw === 'object' && raw !== null && typeof (raw as Save).n === 'number' ? (raw as Save) : null;

describe('store', () => {
  beforeEach(() => localStorage.clear());

  it('localStore читает, пишет и удаляет в localStorage', () => {
    const s = localStore();
    expect(s.get('k')).toBeNull();
    s.set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(s.get('k')).toBe('v');
    s.remove('k');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('writeJson пишет JSON и сообщает об отказе хранилища', () => {
    const s = memStore();
    expect(writeJson(s, 'k', { a: 1 })).toBe(true);
    expect(s.mem.get('k')).toBe('{"a":1}');
    expect(writeJson(broken, 'k', 1)).toBe(false);
  });

  it('removeQuietly удаляет и не всплывает при отказе', () => {
    const s = memStore({ k: 'v' });
    removeQuietly(s, 'k');
    expect(s.mem.has('k')).toBe(false);
    expect(() => removeQuietly(broken, 'k')).not.toThrow();
  });

  it('сейв: запись в конверте с версией, чтение через проверку игры', () => {
    const s = memStore();
    const slot = matchSave(s, 'm', { v: 2, validate });
    expect(slot.load()).toBeNull();
    slot.save({ n: 5 });
    expect(s.mem.get('m')).toBe('{"v":2,"match":{"n":5}}');
    expect(slot.load()).toEqual({ n: 5 });
  });

  it('разбор кэшируется по строке из хранилища и сбрасывается при любой записи', () => {
    const s = memStore({ m: '{"v":2,"match":{"n":1}}' });
    let checks = 0;
    const slot = matchSave(s, 'm', {
      v: 2,
      validate: (raw) => {
        checks++;
        return validate(raw);
      },
    });
    const first = slot.load();
    expect(slot.load()).toBe(first);
    expect(checks).toBe(1);
    s.mem.set('m', '{"v":2,"match":{"n":2}}');
    expect(slot.load()).toEqual({ n: 2 });
    expect(checks).toBe(2);
  });

  it('негодный сейв стирается: порченый JSON, чужая версия, провал проверки, null', () => {
    for (const raw of ['{не json', '{"v":1,"match":{"n":1}}', '{"v":2,"match":{"n":"x"}}', 'null']) {
      const s = memStore({ m: raw });
      expect(matchSave(s, 'm', { v: 2, validate }).load()).toBeNull();
      expect(s.mem.has('m')).toBe(false);
    }
  });

  it('недоступное хранилище: чтение — null, запись молчит', () => {
    const slot = matchSave(broken, 'm', { v: 2, validate });
    expect(slot.load()).toBeNull();
    expect(() => slot.save({ n: 1 })).not.toThrow();
  });
});
