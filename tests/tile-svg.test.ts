// @vitest-environment jsdom
// Отрисовка костей — строковые генераторы SVG. Проверяется, что разметка
// несёт нужные элементы и размеры: упавший шаблон (NaN в координатах,
// потерянные пипсы, перепутанные оси вертикальной обёртки) ловится без
// браузера.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CELL,
  TILE_L,
  TILE_W,
  ensureTileDefs,
  placedTransform,
  tileBack,
  tileCenterAngle,
  tileDefs,
  tileFace,
  tileSvgElement,
} from '../src/tile-svg';

/** Число пипсов в фрагменте разметки. */
function pipCount(svg: string): number {
  return (svg.match(/class="pip"/g) ?? []).length;
}

describe('общие определения', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tileDefs несёт все id, на которые ссылаются кости и разметка ходов', () => {
    const defs = tileDefs();
    for (const id of ['g-ivory', 'g-back', 'f-tile', 'f-raised', 'f-own-first', 'f-own-second']) {
      expect(defs).toContain(`id="${id}"`);
    }
  });

  it('ensureTileDefs ставит один скрытый хост на документ; повторный вызов ничего не делает', () => {
    ensureTileDefs();
    ensureTileDefs();
    const hosts = document.querySelectorAll('#tile-defs');
    expect(hosts).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(hosts[0]);
    expect(hosts[0]!.querySelector('#g-ivory')).not.toBeNull();
  });
});

describe('положение кости на столе', () => {
  it('центр — середина двух клеток, угол — по направлению a→b', () => {
    expect(tileCenterAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual({ cx: CELL / 2, cy: 0, angle: 0 });
    expect(tileCenterAngle({ x: 2, y: 1 }, { x: 2, y: 2 })).toEqual({ cx: 2 * CELL, cy: 1.5 * CELL, angle: 90 });
    expect(tileCenterAngle({ x: 1, y: 0 }, { x: 0, y: 0 }).angle).toBe(180);
  });

  it('placedTransform — translate и rotate с одним знаком после запятой', () => {
    expect(placedTransform({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(`translate(${(CELL / 2).toFixed(1)} 0.0) rotate(0.0)`);
    expect(placedTransform({ x: 0, y: 0 }, { x: 0, y: 1 })).toContain('rotate(90.0)');
  });
});

describe('tileFace — лицо кости', () => {
  it('рисует ровно a+b пипсов для каждой пары значений', () => {
    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6; b++) {
        expect(pipCount(tileFace(a, b)), `${a}:${b}`).toBe(a + b);
      }
    }
  });

  it('в координатах нет NaN', () => {
    for (const svg of [tileFace(0, 0), tileFace(6, 6), tileBack(), tileDefs()]) {
      expect(svg).not.toContain('NaN');
    }
  });

  it('тень: по умолчанию f-tile, raised — f-raised, flat — без фильтра', () => {
    expect(tileFace(1, 2)).toContain('url(#f-tile)');
    expect(tileFace(1, 2, { shadow: 'raised' })).toContain('url(#f-raised)');
    expect(tileFace(1, 2, { shadow: 'flat' })).not.toContain('filter=');
  });

  it('золотая окантовка — только по opts.accent', () => {
    const rects = (svg: string) => (svg.match(/<rect /g) ?? []).length;
    const plain = tileFace(3, 3);
    const accented = tileFace(3, 3, { accent: true });
    expect(accented).toContain('#c9a86a');
    expect(rects(accented)).toBe(rects(plain) + 1);
    expect(plain).not.toContain('#c9a86a');
  });

  it('дополнительный класс попадает на группу', () => {
    expect(tileFace(0, 1, { className: 'ghost' })).toContain('class="tile-face ghost"');
  });
});

describe('tileBack — рубашка', () => {
  it('тёмный лак с рамкой; без эмблемы рубашка гладкая', () => {
    const svg = tileBack();
    expect(svg).toContain('url(#g-back)');
    expect(svg).toContain('url(#f-tile)');
    expect(svg).not.toContain('emblem');
    expect(tileBack({ shadow: 'flat' })).not.toContain('filter=');
    expect(tileBack({ className: 'pile' })).toContain('class="tile-back pile"');
  });

  it('эмблема игры вставляется как есть', () => {
    expect(tileBack({ emblem: '<g class="emblem"/>' })).toContain('<g class="emblem"/>');
  });
});

describe('tileSvgElement — обёртка для рук и базара', () => {
  it('горизонтальная: ширина w, высота по пропорции кости', () => {
    const svg = tileSvgElement(tileFace(2, 5), 96);
    const h = (96 * TILE_W) / TILE_L;
    expect(svg).toContain(`width="96"`);
    expect(svg).toContain(`height="${h}"`);
    expect(svg).toMatch(/class="tile-svg\b/);
    expect(svg).not.toContain('rotate(90)');
  });

  it('вертикальная: стороны меняются местами, внутренности повёрнуты на 90°', () => {
    const svg = tileSvgElement(tileFace(2, 5), 96, { vertical: true });
    const h = (96 * TILE_W) / TILE_L;
    expect(svg).toContain(`width="${h}"`);
    expect(svg).toContain(`height="96"`);
    expect(svg).toContain('rotate(90)');
  });

  it('extraClass добавляется к классу svg в обеих ориентациях', () => {
    expect(tileSvgElement('', 50, { extraClass: 'pile-tile' })).toContain('class="tile-svg pile-tile"');
    expect(tileSvgElement('', 50, { extraClass: 'hand', vertical: true })).toContain('class="tile-svg hand"');
  });
});
