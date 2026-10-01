import { describe, expect, it } from 'vitest';
import { fullSet, hasValue, isDouble, otherValue, parseTile, pipSum, tileId } from '../src/tiles';

/** Табличный разбор кости совпадает с разбором строки. */
describe('tiles: таблица разбора и чтение половинок из id', () => {
  it('все 28 костей: parseTile, isDouble, pipSum, hasValue, otherValue как у разбора строки', () => {
    for (const id of fullSet()) {
      const [hi, lo] = id.split('-').map(Number) as [number, number];
      expect(parseTile(id)).toEqual({ id, hi, lo });
      expect(isDouble(id)).toBe(hi === lo);
      expect(pipSum(id)).toBe(hi + lo);
      for (let v = 0; v <= 6; v++) {
        expect(hasValue(id, v)).toBe(hi === v || lo === v);
        expect(otherValue(id, v)).toBe(hi === v ? lo : hi);
      }
    }
  });

  it('объект из таблицы разделяется между вызовами и заморожен', () => {
    const a = parseTile('6-4');
    expect(parseTile(tileId(4, 6))).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('неканонический id разбирается по-старому', () => {
    expect(parseTile('4-6')).toEqual({ id: '4-6', hi: 4, lo: 6 });
  });
});
