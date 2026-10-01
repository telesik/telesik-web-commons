// RNG: детерминированная цепочка mulberry32 и криптослучайный стартовый
// seed нового матча: базовые свойства цепочки и seedFromCrypto.
import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedFromCrypto, shuffle } from '../src/rng';

describe('rng', () => {
  it('golden-вектор mulberry32: последовательность зашита и не должна меняться', () => {
    // На неизменности этой цепочки держится контракт «партия воспроизводится
    // по (seed, first, variant, moves)»: сохранённые матчи и выгруженные
    // протоколы разыгрываются той же раздачей. Смена констант PRNG обязана
    // уронить этот тест, даже если плейаут и реплей едут синхронно.
    let s = 12345;
    const got: number[] = [];
    for (let i = 0; i < 5; i++) {
      const [v, n] = nextFloat(s);
      got.push(v);
      s = n;
    }
    expect(got).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985,
      0.817934412509203, 0.5094283693470061,
    ]);
    expect(s).toBe(567906818);
    expect(shuffle(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 42)[0]).toEqual([
      'd', 'b', 'a', 'f', 'g', 'c', 'e',
    ]);
  });

  it('nextFloat детерминирован, продвигает состояние и остаётся в [0, 1)', () => {
    let a = 12345;
    for (let i = 0; i < 100; i++) {
      const [v1, s1] = nextFloat(a);
      const [v2, s2] = nextFloat(a);
      expect(v1).toBe(v2);
      expect(s1).toBe(s2);
      expect(s1).not.toBe(a); // состояние двигается — цепочка не вырождается
      expect(v1).toBeGreaterThanOrEqual(0);
      expect(v1).toBeLessThan(1);
      a = s1;
    }
  });

  it('nextInt держит диапазон [0, n) на всей цепочке', () => {
    let s = 777;
    for (let i = 0; i < 200; i++) {
      const [v, s2] = nextInt(s, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      s = s2;
    }
  });

  it('shuffle — перестановка без потерь, детерминированная по состоянию', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const [p1, s1] = shuffle(items, 42);
    const [p2, s2] = shuffle(items, 42);
    expect(p1).toEqual(p2);
    expect(s1).toBe(s2);
    expect([...p1].sort()).toEqual([...items].sort());
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']); // исходный не тронут
  });

  it('seedFromCrypto отдаёт валидный uint32-seed', () => {
    const seeds = [seedFromCrypto(), seedFromCrypto(), seedFromCrypto()];
    for (const s of seeds) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
    // Три подряд одинаковых криптослучайных значения практически невозможны.
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});
