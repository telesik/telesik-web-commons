// Кости домино: стандартный набор дубль-шесть, 28 штук.

/** Идентификатор кости — каноническая строка "hi-lo", hi >= lo. Например "6-4", "0-0". */
export type TileId = string;

export interface Tile {
  readonly id: TileId;
  /** Большая половинка. */
  readonly hi: number;
  /** Меньшая половинка. */
  readonly lo: number;
}

export function tileId(a: number, b: number): TileId {
  return a >= b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Таблица разбора на 28 канонических id — вместо `split('-')` на каждый
 * вызов: через `isDouble`/`pipSum`/`hasValue`/
 * `otherValue` идёт горячий путь перебора бота (миллионы вызовов при
 * бюджете strong), разбор строки и объект на каждый были самым весомым
 * расходом движка. Объекты заморожены и разделяются между вызовами.
 */
const TILE_BY_ID: ReadonlyMap<TileId, Tile> = (() => {
  const m = new Map<TileId, Tile>();
  for (let hi = 0; hi <= 6; hi++) {
    for (let lo = 0; lo <= hi; lo++) {
      const id = tileId(hi, lo);
      m.set(id, Object.freeze({ id, hi, lo }));
    }
  }
  return m;
})();

export function parseTile(id: TileId): Tile {
  const t = TILE_BY_ID.get(id);
  if (t) return t;
  // Неканонический id (не из набора) — прежний разбор, чтобы поведение
  // для произвольной строки не изменилось.
  const [hi, lo] = id.split('-').map(Number) as [number, number];
  return { id, hi, lo };
}

// Ниже — чтение половинок прямо из символов id ("h-l", одна цифра на
// половинку): ни разбора, ни объекта. Код '0' — 48.
const ZERO = 48;

export function isDouble(id: TileId): boolean {
  return id.charCodeAt(0) === id.charCodeAt(2);
}

/** Сумма очков на кости. */
export function pipSum(id: TileId): number {
  return id.charCodeAt(0) + id.charCodeAt(2) - 2 * ZERO;
}

/** Есть ли на кости половинка с числом v. */
export function hasValue(id: TileId, v: number): boolean {
  const c = v + ZERO;
  return id.charCodeAt(0) === c || id.charCodeAt(2) === c;
}

/** Вторая половинка кости при совпадении одной с v. Для дубля вернёт то же v. */
export function otherValue(id: TileId, v: number): number {
  const hi = id.charCodeAt(0) - ZERO;
  return hi === v ? id.charCodeAt(2) - ZERO : hi;
}

/** Полный набор 28 костей в каноническом порядке. */
export function fullSet(): TileId[] {
  const set: TileId[] = [];
  for (let hi = 0; hi <= 6; hi++) {
    for (let lo = 0; lo <= hi; lo++) {
      set.push(tileId(hi, lo));
    }
  }
  return set;
}
