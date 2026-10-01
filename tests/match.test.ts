// Матч поверх контракта движка: старт, учёт раунда, следующий раунд.
import { describe, expect, it } from 'vitest';
import { finishRound, nextRound, startMatch } from '../src/match';
import { playOut, toyEngine, type ToyVariant } from './toy-engine';

const V: ToyVariant = { rounds: 2 };
const NAMES = ['А', 'Б'] as const;

describe('match', () => {
  it('старт: нулевой счёт, первый раунд с номером 0, бот по умолчанию — нет', () => {
    const m = startMatch(toyEngine, { names: NAMES, first: 1, variant: V, seed: 7 });
    expect(m).toMatchObject({ names: NAMES, totals: [0, 0], rounds: [], first: 1, outcome: null, bot: null });
    expect(m.round).toMatchObject({ seed: 7, first: 1, left: 2 });
    const withBot = startMatch(toyEngine, {
      names: NAMES,
      first: 0,
      variant: V,
      seed: 1,
      bot: { player: 1, level: 'easy' },
    });
    expect(withBot.bot).toEqual({ player: 1, level: 'easy' });
  });

  it('без seed раунд получает случайный', () => {
    const m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V });
    expect(Number.isInteger(m.round.seed)).toBe(true);
  });

  it('учёт раунда: очки прибавлены, раунд записан с протоколом, исход спрашивается у игры', () => {
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V, seed: 7 });
    expect(() => finishRound(toyEngine, m)).toThrow('Раунд ещё не завершён');
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    // Две спички, первым брал игрок 0 — последнюю взял игрок 1.
    expect(m.totals).toEqual([10, 0]);
    expect(m.rounds).toEqual([
      { cause: 'out', added: [10, 0], winner: 1, first: 0, seed: 7, moves: [{ type: 'take' }, { type: 'take' }] },
    ]);
    expect(m.outcome).toBeNull();
  });

  it('следующий раунд: первого называет игра, номер раунда растёт; после исхода — нельзя', () => {
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V, seed: 7 });
    expect(() => nextRound(toyEngine, m)).toThrow('Нет завершённых раундов');
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    m = nextRound(toyEngine, m, 9);
    expect(m.first).toBe(1);
    expect(m.round).toMatchObject({ seed: 9, first: 1, left: 3 });
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    // Три спички, первым брал игрок 1 — он же взял последнюю.
    expect(m.totals).toEqual([20, 0]);
    expect(m.outcome).toEqual({ kind: 'win', winner: 1 });
    expect(() => nextRound(toyEngine, m)).toThrow('Матч окончен');
  });

  it('раунд без победителя: первый игрок берётся по правилу игры; seed по умолчанию случайный', () => {
    const v: ToyVariant = { rounds: 3, price: 0 };
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: v, seed: 7 });
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    expect(m.rounds[0]!.winner).toBeNull();
    m = nextRound(toyEngine, m);
    expect(m.first).toBe(1);
    expect(Number.isInteger(m.round.seed)).toBe(true);
  });
});
