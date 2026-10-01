// Протокол ходов и воспроизведение раундов.
//
// Раунд полностью определяется (seed, первый игрок, номер раунда, вариант) и
// списком ходов: всё случайное выводится из seed. На этом стоят режим
// истории, сверка сетевой партии и разбор багов.

import type { GameEngine, MoveCore, RoundCore, RoundResultCore, Seat } from './engine';
import type { MatchState } from './match';
import type { RngState } from './rng';

export interface RoundProtocol<M, R> {
  readonly seed: RngState;
  readonly first: Seat;
  readonly moves: readonly M[];
  /** Итог раунда, если он завершён, — только для отображения. */
  readonly result?: R;
}

/** Протокол матча. Номер раунда — место в списке rounds. */
export interface MatchProtocol<M, V, R> {
  readonly format: string;
  readonly v: 1;
  readonly names: readonly [string, string];
  readonly variant: V;
  readonly rounds: readonly RoundProtocol<M, R>[];
  readonly totals?: readonly [number, number];
}

/** Имя формата протокола игры. */
export function protocolFormat(engine: { readonly id: string; readonly protocolFormat?: string }): string {
  return engine.protocolFormat ?? `${engine.id}-protocol`;
}

/** Собрать протокол матча: учтённые раунды плюс текущий, если он ещё идёт. */
export function matchProtocol<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(engine: GameEngine<S, M, V, R, L, O>, match: MatchState<S, M, V, R, O>): MatchProtocol<M, V, R> {
  const rounds: RoundProtocol<M, R>[] = match.rounds.map((r) => {
    const { first, seed, moves, ...result } = r;
    return { seed, first, moves, result: result as unknown as R };
  });
  const cur = match.round;
  if (cur.phase !== 'over') {
    rounds.push({ seed: cur.seed, first: cur.first, moves: cur.history });
  }
  return {
    format: protocolFormat(engine),
    v: 1,
    names: match.names,
    variant: match.variant,
    rounds,
    totals: match.totals,
  };
}

/**
 * Воспроизвести раунд по протоколу: первые upTo ходов (по умолчанию все).
 * Бросает исключение, если какой-то ход нелегален, — так протокол проверяется
 * самим движком.
 */
export function replayRound<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(
  engine: GameEngine<S, M, V, R, L, O>,
  p: RoundProtocol<M, R>,
  variant: V,
  index: number,
  upTo?: number,
): S {
  let state = engine.newRound({ seed: p.seed, first: p.first, index, variant });
  const n = upTo === undefined ? p.moves.length : Math.min(upTo, p.moves.length);
  for (let i = 0; i < n; i++) {
    try {
      state = engine.applyMove(state, p.moves[i]!);
    } catch (err) {
      throw new Error(`ход ${i + 1}: ${(err as Error).message}`);
    }
  }
  return state;
}

export type ProtocolCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly round: number; readonly error: string };

/** Проверить весь протокол воспроизведением через движок. */
export function validateProtocol<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(engine: GameEngine<S, M, V, R, L, O>, p: MatchProtocol<M, V, R>): ProtocolCheck {
  for (let i = 0; i < p.rounds.length; i++) {
    try {
      replayRound(engine, p.rounds[i]!, p.variant, i);
    } catch (err) {
      return { ok: false, round: i, error: (err as Error).message };
    }
  }
  return { ok: true };
}
