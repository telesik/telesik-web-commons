// Матч — серия раундов одной игры. Что считать концом матча и кто ходит
// первым в следующем раунде, решает игра (GameEngine); здесь — общий
// порядок: начать, учесть итог раунда, перейти к следующему.

import type { BotSeat, GameEngine, MoveCore, RoundCore, RoundResultCore, Seat } from './engine';
import { seedFromCrypto, type RngState } from './rng';

/** Учтённый раунд: его итог и протокол. Номер раунда — место в списке. */
export type FinishedRound<M, R> = R & {
  /** Кто был первым игроком в этом раунде. */
  readonly first: Seat;
  /** Seed раунда — для воспроизведения по протоколу. */
  readonly seed: RngState;
  /** Все ходы раунда по порядку. */
  readonly moves: readonly M[];
};

export interface MatchState<S, M, V, R, O> {
  readonly names: readonly [string, string];
  readonly totals: readonly [number, number];
  readonly rounds: readonly FinishedRound<M, R>[];
  readonly variant: V;
  /** Первый игрок текущего раунда. */
  readonly first: Seat;
  readonly round: S;
  /** Исход матча; null — матч идёт. Вид исхода — у игры. */
  readonly outcome: O | null;
  /** Бот за одной из сторон; null или нет поля — соперник-человек. */
  readonly bot?: BotSeat | null;
}

export interface StartMatchOptions<V> {
  readonly names: readonly [string, string];
  /** Кому выпал жребий: он первый в первом раунде. */
  readonly first: Seat;
  readonly variant: V;
  readonly seed?: RngState;
  readonly bot?: BotSeat | null;
}

export function startMatch<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(engine: GameEngine<S, M, V, R, L, O>, opts: StartMatchOptions<V>): MatchState<S, M, V, R, O> {
  const seed = opts.seed ?? seedFromCrypto();
  return {
    names: opts.names,
    totals: [0, 0],
    rounds: [],
    variant: opts.variant,
    first: opts.first,
    round: engine.newRound({ seed, first: opts.first, index: 0, variant: opts.variant }),
    outcome: null,
    bot: opts.bot ?? null,
  };
}

/** Принять итог завершённого раунда: прибавить очки и спросить игру об исходе матча. */
export function finishRound<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(engine: GameEngine<S, M, V, R, L, O>, match: MatchState<S, M, V, R, O>): MatchState<S, M, V, R, O> {
  const result = match.round.result;
  if (!result) throw new Error('Раунд ещё не завершён');
  const totals: [number, number] = [
    match.totals[0] + result.added[0],
    match.totals[1] + result.added[1],
  ];
  const rounds: FinishedRound<M, R>[] = [
    ...match.rounds,
    { ...result, first: match.first, seed: match.round.seed, moves: match.round.history },
  ];
  const outcome = engine.matchOutcome(totals, rounds.length, match.variant);
  return { ...match, totals, rounds, outcome };
}

/** Начать следующий раунд; первого игрока называет игра по последнему учтённому раунду. */
export function nextRound<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(
  engine: GameEngine<S, M, V, R, L, O>,
  match: MatchState<S, M, V, R, O>,
  seed?: RngState,
): MatchState<S, M, V, R, O> {
  const last = match.rounds[match.rounds.length - 1];
  if (!last) throw new Error('Нет завершённых раундов');
  if (match.outcome) throw new Error('Матч окончен');
  const first = engine.nextFirst({ first: last.first, winner: last.winner });
  return {
    ...match,
    first,
    round: engine.newRound({
      seed: seed ?? seedFromCrypto(),
      first,
      index: match.rounds.length,
      variant: match.variant,
    }),
  };
}
