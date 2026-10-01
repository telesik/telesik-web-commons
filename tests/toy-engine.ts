// Игрушечная игра для тестов матча и протокола: «спички». В раунде лежит
// 2 + index спичек, игроки по очереди берут по одной; взявший последнюю
// выигрывает раунд, проигравший получает очки. Не тест — общий помощник.
import type { GameEngine, RoundCore, Seat } from '../src/engine';

export interface ToyMove {
  readonly type: 'take' | 'skip';
  readonly t?: number;
}
export interface ToyResult {
  readonly cause: 'out';
  readonly added: readonly [number, number];
  readonly winner: Seat | null;
}
export interface ToyVariant {
  /** Сколько раундов в матче. */
  readonly rounds: number;
  /** Очки проигравшему раунд; 0 — раунд без победителя. */
  readonly price?: number;
}
export type ToyLog = { readonly kind: 'take'; readonly player: Seat };
export interface ToyState extends RoundCore<ToyMove, ToyResult, ToyLog> {
  readonly left: number;
  readonly variant: ToyVariant;
}
export type ToyOutcome = { readonly kind: 'win'; readonly winner: Seat } | { readonly kind: 'draw' };

export const toyEngine: GameEngine<ToyState, ToyMove, ToyVariant, ToyResult, ToyLog, ToyOutcome> = {
  id: 'toy',
  rulesVersion: '1.0',
  defaultVariant: { rounds: 2 },
  canonVariant: (v) => ({ rounds: v.rounds, ...(v.price === undefined ? {} : { price: v.price }) }),
  sameVariant: (a, b) => a.rounds === b.rounds && a.price === b.price,
  newRound: ({ seed, first, index, variant }) => ({
    phase: 'play',
    current: first,
    first,
    seed,
    history: [],
    result: null,
    log: [],
    hands: [[], []],
    boneyard: [],
    left: 2 + index,
    variant,
  }),
  legalMoves: (s) => (s.phase === 'over' ? [] : [{ type: 'take' }]),
  applyMove(s, m) {
    if (s.phase === 'over') throw new Error('Раунд окончен');
    if (m.type !== 'take') throw new Error('Нелегальный ход');
    const left = s.left - 1;
    const history = [...s.history, m];
    const log: ToyLog[] = [...s.log, { kind: 'take', player: s.current }];
    if (left > 0) {
      return { ...s, left, history, log, current: (1 - s.current) as Seat };
    }
    const price = s.variant.price ?? 10;
    const added: [number, number] = [0, 0];
    added[1 - s.current] = price;
    const winner = price === 0 ? null : s.current;
    return { ...s, left, history, log, phase: 'over', result: { cause: 'out', added, winner } };
  },
  moveEquals: (a, b) => a.type === b.type,
  matchOutcome(totals, rounds, variant) {
    if (rounds < variant.rounds) return null;
    return totals[0] === totals[1]
      ? { kind: 'draw' }
      : { kind: 'win', winner: totals[0] < totals[1] ? 0 : 1 };
  },
  nextFirst: (last) => last.winner ?? ((1 - last.first) as Seat),
};

/** Доиграть раунд до конца. */
export function playOut(s: ToyState): ToyState {
  let cur = s;
  while (cur.phase !== 'over') cur = toyEngine.applyMove(cur, { type: 'take' });
  return cur;
}
