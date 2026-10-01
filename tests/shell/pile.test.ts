// @vitest-environment jsdom
// Куча базара: раскладка по seed, разметка кости, зона кучи и ближайшая кость.
import { describe, expect, it } from 'vitest';
import {
  killSprites,
  nearestPileSprite,
  pileTileHtml,
  pileZone,
  scatterSprites,
  type PileSprite,
} from '../../src/shell/pile';

const rectOf = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('pile', () => {
  it('раскладка детерминирована по seed и содержит ровно count живых костей', () => {
    const a = scatterSprites(7, 14);
    expect(a).toHaveLength(14);
    expect(a.every((s) => s.alive)).toBe(true);
    expect(scatterSprites(7, 14)).toEqual(a);
    expect(scatterSprites(8, 14)).not.toEqual(a);
    expect(scatterSprites(7, 3)).toEqual(a.slice(0, 3));
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(12);
      expect(s.x).toBeLessThan(192);
      expect(s.y).toBeGreaterThanOrEqual(8);
      expect(s.y).toBeLessThan(148);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(50);
    }
  });

  it('разметка кости: место, поворот, номер для клика — или без номера', () => {
    const s: PileSprite = { x: 10, y: 20, rot: 30, alive: true };
    const withIdx = pileTileHtml(s, '<svg></svg>', 3);
    expect(withIdx).toContain('data-pile="3"');
    expect(withIdx).toContain('left:10px; top:20px; --rot:30deg; transform:rotate(30deg)');
    expect(withIdx).toContain('<svg></svg>');
    expect(pileTileHtml(s, '<svg></svg>')).not.toContain('data-pile');
  });

  it('killSprites гасит первые живые до нужного числа разобранных', () => {
    const sprites = scatterSprites(1, 4);
    sprites[1]!.alive = false;
    killSprites(sprites, 3);
    expect(sprites.map((s) => s.alive)).toEqual([false, false, false, true]);
    // Уже достаточно разобранных — ничего не меняется; больше, чем есть, — гасит все.
    killSprites(sprites, 2);
    expect(sprites.filter((s) => s.alive)).toHaveLength(1);
    killSprites(sprites, 9);
    expect(sprites.some((s) => s.alive)).toBe(false);
  });

  it('зона кучи: по всем костям раунда с учётом поворота и масштаба контейнера', () => {
    const el = document.createElement('div');
    expect(pileZone(el, [{ x: 0, y: 0, rot: 0, alive: true }])).toBeNull();
    el.innerHTML = '<div class="pile-tile"></div>';
    const tile = el.querySelector<HTMLElement>('.pile-tile')!;
    Object.defineProperty(tile, 'offsetWidth', { value: 80 });
    Object.defineProperty(tile, 'offsetHeight', { value: 40 });
    expect(pileZone(el, [])).toBeNull();
    el.getBoundingClientRect = () => rectOf(100, 50, 200, 100);
    // Контейнер без собственной ширины — масштаб 1; кость без поворота.
    expect(pileZone(el, [{ x: 10, y: 20, rot: 0, alive: false }])).toEqual({ l: 110, t: 70, r: 190, b: 110 });
    // Контейнер ужат вдвое; повёрнутая на 90° кость меняет ширину и высоту местами.
    Object.defineProperty(el, 'offsetWidth', { value: 400 });
    const z = pileZone(el, [
      { x: 0, y: 0, rot: 0, alive: true },
      { x: 100, y: 0, rot: 90, alive: true },
    ])!;
    expect(z.l).toBeCloseTo(100, 6);
    expect(z.t).toBeCloseTo(50 + (20 - 40) * 0.5, 6);
    expect(z.r).toBeCloseTo(100 + (140 + 20) * 0.5, 6);
    expect(z.b).toBeCloseTo(50 + (20 + 40) * 0.5, 6);
  });

  it('ближайшая к точке кость кучи', () => {
    const el = document.createElement('div');
    expect(nearestPileSprite(el, 0, 0)).toBeNull();
    el.innerHTML = '<div class="pile-tile" data-pile="0"></div><div class="pile-tile" data-pile="2"></div>';
    const [a, b] = [...el.querySelectorAll<HTMLElement>('.pile-tile')];
    a!.getBoundingClientRect = () => rectOf(0, 0, 40, 20);
    b!.getBoundingClientRect = () => rectOf(200, 0, 40, 20);
    expect(nearestPileSprite(el, 30, 10)).toEqual({ idx: 0, el: a });
    expect(nearestPileSprite(el, 190, 10)).toEqual({ idx: 2, el: b });
  });
});
