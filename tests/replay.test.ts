// Протокол матча и воспроизведение раундов через движок.
import { describe, expect, it } from 'vitest';
import { finishRound, nextRound, startMatch } from '../src/match';
import { matchProtocol, protocolFormat, replayRound, validateProtocol } from '../src/replay';
import { playOut, toyEngine, type ToyVariant } from './toy-engine';

const V: ToyVariant = { rounds: 2 };
const NAMES = ['А', 'Б'] as const;

describe('replay', () => {
  it('имя формата: по id игры или историческое', () => {
    expect(protocolFormat(toyEngine)).toBe('toy-protocol');
    expect(protocolFormat({ id: 'toy', protocolFormat: 'old-protocol' })).toBe('old-protocol');
  });

  it('протокол: учтённые раунды с итогом плюс текущий, пока он идёт', () => {
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V, seed: 7 });
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    m = nextRound(toyEngine, m, 9);
    m = { ...m, round: toyEngine.applyMove(m.round, { type: 'take', t: 120 }) };
    expect(matchProtocol(toyEngine, m)).toEqual({
      format: 'toy-protocol',
      v: 1,
      names: NAMES,
      variant: V,
      rounds: [
        {
          seed: 7,
          first: 0,
          moves: [{ type: 'take' }, { type: 'take' }],
          result: { cause: 'out', added: [10, 0], winner: 1 },
        },
        { seed: 9, first: 1, moves: [{ type: 'take', t: 120 }] },
      ],
      totals: [10, 0],
    });
  });

  it('оконченный раунд в протокол второй раз не попадает', () => {
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V, seed: 7 });
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    expect(matchProtocol(toyEngine, m).rounds).toHaveLength(1);
  });

  it('воспроизведение: номер раунда доходит до движка, upTo обрезает ходы', () => {
    const p = { seed: 9, first: 1 as const, moves: [{ type: 'take' as const }, { type: 'take' as const }, { type: 'take' as const }] };
    const full = replayRound(toyEngine, p, V, 1);
    expect(full.phase).toBe('over');
    expect(full.result!.winner).toBe(1);
    expect(replayRound(toyEngine, p, V, 1, 1)).toMatchObject({ phase: 'play', left: 2, current: 0 });
    expect(replayRound(toyEngine, p, V, 1, 99).phase).toBe('over');
    expect(replayRound(toyEngine, p, V, 1, 0)).toMatchObject({ left: 3, history: [] });
  });

  it('нелегальный ход: исключение с номером хода', () => {
    const p = { seed: 1, first: 0 as const, moves: [{ type: 'take' as const }, { type: 'skip' as const }] };
    expect(() => replayRound(toyEngine, p, V, 0)).toThrow('ход 2: Нелегальный ход');
  });

  it('проверка протокола: исправный — ok, сломанный — номер раунда и причина', () => {
    let m = startMatch(toyEngine, { names: NAMES, first: 0, variant: V, seed: 7 });
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    m = nextRound(toyEngine, m, 9);
    m = finishRound(toyEngine, { ...m, round: playOut(m.round) });
    const proto = matchProtocol(toyEngine, m);
    expect(validateProtocol(toyEngine, proto)).toEqual({ ok: true });
    // Лишний ход во втором раунде: раунд уже окончен.
    const broken = {
      ...proto,
      rounds: [proto.rounds[0]!, { ...proto.rounds[1]!, moves: [...proto.rounds[1]!.moves, { type: 'take' as const }] }],
    };
    expect(validateProtocol(toyEngine, broken)).toEqual({ ok: false, round: 1, error: 'ход 4: Раунд окончен' });
  });
});
