// Контракт движка домино-игры на двоих. Каркас приложения, матч и протокол
// знают игру только через него: правила, раскладка и счёт раунда — у игры.
// Здесь одни типы.

import type { RngState } from './rng';
import type { TileId } from './tiles';

/** Место за столом; индексы постоянны на весь матч. */
export type Seat = 0 | 1;

/** Сила бота. */
export type BotLevel = 'easy' | 'normal' | 'strong';

/** За какую сторону и с какой силой играет бот. */
export interface BotSeat {
  readonly player: Seat;
  readonly level: BotLevel;
}

/** Ход: вид хода и, если замер честный, время обдумывания в мс. */
export interface MoveCore {
  readonly type: string;
  readonly t?: number;
}

/** Итог раунда — то, что нужно матчу: прибавка к счёту и победитель. */
export interface RoundResultCore {
  readonly added: readonly [number, number];
  /** null — победителя нет. */
  readonly winner: Seat | null;
}

/** Состояние раунда — то, что читают матч, протокол и каркас приложения. */
export interface RoundCore<M, R, L> {
  /** 'over' — раунд окончен; остальные фазы — дело игры. */
  readonly phase: string;
  readonly current: Seat;
  /** Первый игрок раунда. */
  readonly first: Seat;
  /** Seed раунда: вместе с history образует протокол. */
  readonly seed: RngState;
  /** Применённые ходы по порядку. */
  readonly history: readonly M[];
  readonly result: R | null;
  /** Журнал раунда: каждый применённый ход оставляет в нём хотя бы одну запись. */
  readonly log: readonly L[];
  readonly hands: readonly [readonly TileId[], readonly TileId[]];
  readonly boneyard: readonly TileId[];
}

export interface NewRoundArgs<V> {
  readonly seed: RngState;
  readonly first: Seat;
  /** Номер раунда в матче, с 0 (игре, где раунды одинаковы, безразличен). */
  readonly index: number;
  readonly variant: V;
}

export interface BotMoveArgs {
  readonly seat: Seat;
  readonly level: BotLevel;
  /** Счёт матча до текущего раунда. */
  readonly totals: readonly [number, number];
  /** Seed случайности бота. */
  readonly seed: RngState;
}

/**
 * Игра глазами общего кода. S — состояние раунда, M — ход, V — вариант
 * правил, R — итог раунда, L — запись журнала, O — исход матча.
 */
export interface GameEngine<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
> {
  /** Имя игры в форматах и ключах: «<id>-protocol». */
  readonly id: string;
  /** Формат протокола, если он исторически отличается от «<id>-protocol». */
  readonly protocolFormat?: string;
  /** Редакция правил, как она названа в тексте правил («1.1»): строка версии, сверка сборок по сети. */
  readonly rulesVersion: string;
  readonly defaultVariant: V;
  /** Вариант в каноническом виде — для сети и сравнения. */
  canonVariant(v: V): V;
  sameVariant(a: V, b: V): boolean;

  newRound(o: NewRoundArgs<V>): S;
  legalMoves(s: S): M[];
  /** Бросает исключение на нелегальном ходе. */
  applyMove(s: S, m: M): S;
  /** Равенство ходов без учёта времени обдумывания. */
  moveEquals(a: M, b: M): boolean;

  /** Исход матча после очередного учтённого раунда; null — матч продолжается. */
  matchOutcome(totals: readonly [number, number], rounds: number, variant: V): O | null;
  /** Кто первый в следующем раунде. */
  nextFirst(last: { readonly first: Seat; readonly winner: Seat | null }): Seat;

  /** Ход бота. Честность (что бот видит) — забота игры. */
  chooseBotMove?(s: S, o: BotMoveArgs): M;
}
