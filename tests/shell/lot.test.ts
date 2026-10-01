// Жребий первого хода: две кости с разными суммами, первым — у кого меньше.
import { describe, expect, it } from 'vitest';
import { drawLot } from '../../src/shell/lot';
import { fullSet, pipSum } from '../../src/tiles';

/** Источник «случайности» из заранее заданных индексов костей набора. */
function fixed(...indexes: number[]): () => number {
  let i = 0;
  return () => (indexes[i++]! + 0.5) / 28;
}

describe('drawLot', () => {
  const set = fullSet();

  it('у кого сумма меньше — тот первый', () => {
    const lo = set.findIndex((t) => pipSum(t) === 1);
    const hi = set.findIndex((t) => pipSum(t) === 12);
    expect(drawLot(fixed(lo, hi))).toEqual({ tiles: [set[lo], set[hi]], first: 0 });
    expect(drawLot(fixed(hi, lo))).toEqual({ tiles: [set[hi], set[lo]], first: 1 });
  });

  it('равные суммы перетягиваются, пока не станут разными', () => {
    const a = set.findIndex((t) => pipSum(t) === 6);
    const same = set.findIndex((t, i) => i !== a && pipSum(t) === 6);
    const diff = set.findIndex((t) => pipSum(t) === 2);
    const lot = drawLot(fixed(a, a, same, diff));
    expect(lot.tiles).toEqual([set[a], set[diff]]);
    expect(lot.first).toBe(1);
  });

  it('без параметра берёт Math.random', () => {
    const lot = drawLot();
    expect(pipSum(lot.tiles[0])).not.toBe(pipSum(lot.tiles[1]));
    expect(lot.first).toBe(pipSum(lot.tiles[0]) < pipSum(lot.tiles[1]) ? 0 : 1);
  });
});
