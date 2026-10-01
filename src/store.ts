// Хранилище настроек и сохранений: строки по ключу. По умолчанию —
// localStorage; оболочка платформы может подставить своё (нативные настройки).

/** Синхронное хранилище строк по ключу. */
export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Хранилище на localStorage браузера. */
export function localStore(): KVStore {
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  };
}

/**
 * Записать значение как JSON. Отказ хранилища (приватный режим, квота) не
 * всплывает: запись настроек не должна ронять игру. Возвращает, удалось ли.
 */
export function writeJson(store: KVStore, key: string, value: unknown): boolean {
  try {
    store.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Удалить ключ; отказ хранилища не всплывает. */
export function removeQuietly(store: KVStore, key: string): void {
  try {
    store.remove(key);
  } catch {
    /* хранилище недоступно — удалять нечего */
  }
}

export interface MatchSaveOptions<T> {
  /** Версия конверта: сейв с другой версией не читается и стирается. */
  readonly v: number;
  /** Проверка содержимого: знает игру. null — сейв негоден. */
  validate(match: unknown): T | null;
}

export interface MatchSave<T> {
  /** Прочитать сейв. Негодный (порченый JSON, чужая версия, провал проверки) стирается. */
  load(): T | null;
  save(match: T): void;
}

/**
 * Сейв матча в конверте `{ v, match }`. Разбор кэшируется по самой строке из
 * хранилища: любая запись, в том числе мимо этого объекта, меняет строку — и
 * кэш сбрасывается сам.
 */
export function matchSave<T>(store: KVStore, key: string, opts: MatchSaveOptions<T>): MatchSave<T> {
  let cachedRaw: string | null = null;
  let cached: T | null = null;
  const drop = (): null => {
    removeQuietly(store, key);
    return null;
  };
  return {
    load() {
      try {
        const raw = store.get(key);
        if (!raw) return null;
        if (raw === cachedRaw) return cached;
        const data = JSON.parse(raw) as { v?: unknown; match?: unknown } | null;
        const match = data?.v === opts.v ? opts.validate(data.match) : null;
        if (match === null) return drop();
        cachedRaw = raw;
        cached = match;
        return match;
      } catch {
        return drop();
      }
    },
    save(match) {
      writeJson(store, key, { v: opts.v, match });
    },
  };
}
