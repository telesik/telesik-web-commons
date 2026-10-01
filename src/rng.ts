// Детерминированный PRNG (mulberry32). Состояние — одно 32-битное число,
// хранится в состоянии партии: при одинаковом seed партия воспроизводима —
// на этом стоят реплей, сетевая игра и разбор багов.

export type RngState = number;

export function seedFromCrypto(): RngState {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

/** Один шаг mulberry32: возвращает [случайное число в [0,1), новое состояние]. */
export function nextFloat(state: RngState): [number, RngState] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [r, a >>> 0];
}

/** Целое в [0, n). */
export function nextInt(state: RngState, n: number): [number, RngState] {
  const [r, s] = nextFloat(state);
  return [Math.floor(r * n), s];
}

/** Тасование Фишера–Йетса, возвращает новый массив и новое состояние RNG. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const arr = items.slice();
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const [j, s2] = nextInt(s, i + 1);
    s = s2;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return [arr, s];
}
