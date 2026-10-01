// Время на экране итогов: честные замеры и подстановка среднего на показе.
import { describe, expect, it } from 'vitest';
import { avgFill, fmtDuration, matchTimes, roundTimeMs } from '../../src/shell/timing';

describe('timing', () => {
  it('avgFill: пропускам — среднее известных; без известных — null', () => {
    expect(avgFill([1000, null, 3000])).toBe(6000);
    expect(avgFill([500])).toBe(500);
    expect(avgFill([null, null])).toBeNull();
    expect(avgFill([])).toBeNull();
  });

  it('roundTimeMs: берёт только числовые t', () => {
    expect(roundTimeMs([{ t: 1000 }, {}, { t: 2000 }])).toBe(4500);
    expect(roundTimeMs([{}, {}])).toBeNull();
  });

  it('fmtDuration: м:сс до часа, дальше ч:мм:сс', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(65_400)).toBe('1:05');
    expect(fmtDuration(3_599_000)).toBe('59:59');
    expect(fmtDuration(3_725_000)).toBe('1:02:05');
  });

  it('matchTimes: последний раунд и сумма матча; раунд без замеров получает среднее', () => {
    expect(matchTimes([])).toBeNull();
    expect(matchTimes([{ moves: [{}, {}] }])).toBeNull();
    expect(matchTimes([{ moves: [{ t: 1000 }, { t: 3000 }] }])).toEqual({ round: 4000, match: 4000 });
    // Второй раунд без замеров: на показе — среднее замеренных (4000 и 2000).
    expect(
      matchTimes([{ moves: [{ t: 4000 }] }, { moves: [{ t: 2000 }] }, { moves: [{}] }]),
    ).toEqual({ round: 3000, match: 9000 });
  });
});
