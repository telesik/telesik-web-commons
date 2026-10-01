// Мини-рандом UI и тестов: детерминизм и диапазон.
import { describe, expect, it } from 'vitest';
import { lcg } from '../src/lcg';

describe('lcg', () => {
  it('один seed — одна последовательность, разные — разные', () => {
    const a = lcg(42);
    const b = lcg(42);
    const c = lcg(43);
    const seqA = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(seqA);
  });

  it('значения в [0, 1); отрицательный и дробный seed берутся по модулю 2^32', () => {
    const r = lcg(-1.7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(lcg(4294967296 + 7)()).toBe(lcg(7)());
  });
});
