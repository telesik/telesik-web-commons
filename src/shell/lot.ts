// Жребий первого хода: каждый тянет по кости, у кого сумма меньше — тот
// первый. Чистая визуализация: на матч влияет только то, кто оказался первым.
import type { Seat } from '../engine';
import { fullSet, pipSum, type TileId } from '../tiles';

export interface Lot {
  /** Кости игроков 0 и 1; суммы очков у них разные. */
  readonly tiles: readonly [TileId, TileId];
  readonly first: Seat;
}

/** Бросить жребий. rand — источник случайности в [0, 1). */
export function drawLot(rand: () => number = Math.random): Lot {
  const set = fullSet();
  const a = set[Math.floor(rand() * set.length)]!;
  let b = a;
  while (pipSum(b) === pipSum(a)) {
    b = set[Math.floor(rand() * set.length)]!;
  }
  return { tiles: [a, b], first: pipSum(a) < pipSum(b) ? 0 : 1 };
}
