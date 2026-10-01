// @vitest-environment jsdom
// Кадр стола: панорама, щипок, колесо, двойной клик, плавный переезд,
// подгонка под содержимое и довод точки в кадр. jsdom геометрии не считает —
// прямоугольник стола подменяется.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createViewport, type ViewGesture, type Viewport, type ViewportOptions } from '../src/viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
const rectOf = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

let svg: SVGSVGElement;
let gestures: ViewGesture[];
let resets: number;

function make(over: Partial<ViewportOptions> = {}, coarse = false): Viewport {
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: coarse });
  return createViewport(svg, {
    initial: { x: 0, y: 0, w: 800, h: 450 },
    minW: 200,
    maxW: 1600,
    holdSelector: '[data-move]',
    onGesture: (kind) => gestures.push(kind),
    onReset: () => resets++,
    ...over,
  });
}

function pointer(type: string, id: number, x: number, y: number, button = 0, target: Element = svg): void {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: id, button, clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}
function wheel(deltaY: number, x: number, y: number): WheelEvent {
  const ev = new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true });
  svg.dispatchEvent(ev);
  return ev;
}
const attr = (): number[] => svg.getAttribute('viewBox')!.split(' ').map(Number);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  document.body.innerHTML = '';
  svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  svg.getBoundingClientRect = () => rectOf(0, 0, 800, 450);
  Element.prototype.setPointerCapture = () => undefined;
  gestures = [];
  resets = 0;
});
afterEach(() => vi.useRealTimers());

describe('viewport: кадр', () => {
  it('старт: кадр и аспект выставлены на svg', () => {
    const vp = make();
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(attr()).toEqual([0, 0, 800, 450]);
    expect(vp.get()).toEqual({ x: 0, y: 0, w: 800, h: 450 });
  });

  it('set без анимации ставит кадр сразу; с анимацией — доезжает за кадры', () => {
    const vp = make();
    vp.set({ x: 10, y: 20, w: 400, h: 225 }, false);
    expect(attr()).toEqual([10, 20, 400, 225]);
    vp.set({ x: 110, y: 20, w: 400, h: 225 }, true);
    expect(attr()[0]).toBe(10);
    vi.advanceTimersByTime(100);
    expect(attr()[0]).toBeGreaterThan(10);
    expect(attr()[0]).toBeLessThan(110);
    vi.advanceTimersByTime(400);
    expect(attr()).toEqual([110, 20, 400, 225]);
  });

  it('новый set отменяет начатый переезд', () => {
    const vp = make();
    vp.set({ x: 100, y: 0, w: 800, h: 450 }, true);
    vi.advanceTimersByTime(50);
    vp.set({ x: -5, y: 0, w: 800, h: 450 }, false);
    vi.advanceTimersByTime(500);
    expect(attr()).toEqual([-5, 0, 800, 450]);
  });
});

describe('viewport: жесты', () => {
  it('драг сдвигает кадр, сообщает о панораме и помечает нажатие как драг', () => {
    const vp = make();
    pointer('pointerdown', 1, 100, 100);
    expect(vp.dragged()).toBe(false);
    pointer('pointermove', 1, 160, 130);
    expect(attr()).toEqual([-60, -30, 800, 450]);
    pointer('pointerup', 1, 160, 130);
    expect(gestures).toEqual(['pan']);
    expect(vp.dragged()).toBe(true);
    // Следующее нажатие начинается с чистого листа.
    pointer('pointerdown', 2, 10, 10);
    expect(vp.dragged()).toBe(false);
    pointer('pointerup', 2, 10, 10);
    expect(gestures).toEqual(['pan']);
  });

  it('сдвиг меньше порога — не драг; у пальца порог больше', () => {
    make();
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 102, 101);
    pointer('pointerup', 1, 102, 101);
    expect(attr()).toEqual([0, 0, 800, 450]);
    expect(gestures).toEqual([]);

    svg.remove();
    svg = document.createElementNS(SVG_NS, 'svg');
    document.body.appendChild(svg);
    svg.getBoundingClientRect = () => rectOf(0, 0, 800, 450);
    make({}, true);
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 104, 104);
    pointer('pointerup', 1, 104, 104);
    expect(gestures).toEqual([]);
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 108, 108);
    pointer('pointerup', 1, 108, 108);
    expect(gestures).toEqual(['pan']);
  });

  it('нажатие на удерживаемый элемент панораму не начинает; правая кнопка и чужой указатель — мимо', () => {
    make();
    const ghost = document.createElementNS(SVG_NS, 'g');
    ghost.setAttribute('data-move', '{}');
    svg.appendChild(ghost);
    pointer('pointerdown', 1, 100, 100, 0, ghost);
    pointer('pointermove', 1, 300, 300);
    pointer('pointerup', 1, 300, 300);
    pointer('pointerdown', 2, 100, 100, 2);
    pointer('pointermove', 2, 300, 300);
    pointer('pointercancel', 2, 300, 300);
    pointer('pointermove', 7, 200, 200);
    expect(attr()).toEqual([0, 0, 800, 450]);
    expect(gestures).toEqual([]);
  });

  it('драг отменяет начатый переезд кадра', () => {
    const vp = make();
    vp.set({ x: 500, y: 0, w: 800, h: 450 }, true);
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 150, 100);
    vi.advanceTimersByTime(500);
    expect(attr()).toEqual([-50, 0, 800, 450]);
  });

  it('колесо масштабирует вокруг курсора в пределах ширины', () => {
    make();
    const ev = wheel(100, 400, 225);
    expect(ev.defaultPrevented).toBe(true);
    const out = attr();
    expect(out[2]).toBeCloseTo(920, 6);
    // Мировая точка под курсором осталась на месте.
    expect(out[0]! + out[2]! / 2).toBeCloseTo(400, 6);
    expect(out[1]! + out[3]! / 2).toBeCloseTo(225, 6);
    wheel(-100, 400, 225);
    expect(attr()[2]).toBeCloseTo(800, 6);
    expect(gestures).toEqual(['wheel', 'wheel']);
    for (let i = 0; i < 20; i++) wheel(100, 400, 225);
    expect(attr()[2]).toBe(1600);
    for (let i = 0; i < 40; i++) wheel(-100, 400, 225);
    expect(attr()[2]).toBe(200);
  });

  it('щипок: зум и панорама центра; третий палец игнорируется; остаток щипка не становится драгом', () => {
    const vp = make();
    pointer('pointerdown', 1, 300, 200);
    pointer('pointerdown', 2, 500, 200);
    expect(vp.dragged()).toBe(true);
    pointer('pointerdown', 3, 400, 300);
    pointer('pointermove', 2, 600, 200);
    const zoomed = attr();
    expect(zoomed[2]).toBeLessThan(800);
    expect(gestures).toEqual(['pinch']);
    // Пальцы сошлись вплотную — шаг пропускается.
    pointer('pointermove', 1, 600, 200);
    pointer('pointermove', 2, 600, 200);
    pointer('pointermove', 3, 600, 200);
    const n = gestures.length;
    pointer('pointermove', 3, 600, 200);
    expect(gestures.length).toBe(n);
    // Ушёл один из трёх — замер пересеян по оставшимся, щипок продолжается.
    pointer('pointerup', 3, 600, 200);
    pointer('pointerup', 2, 600, 200);
    const after = attr();
    pointer('pointermove', 1, 100, 100);
    expect(attr()).toEqual(after);
    pointer('pointerup', 1, 100, 100);
    // Новое нажатие во время щипка одного пальца драгом не становится…
    pointer('pointerdown', 4, 100, 100);
    pointer('pointermove', 4, 200, 200);
    pointer('pointerup', 4, 200, 200);
    expect(attr()[0]).not.toBe(after[0]);
    expect(gestures[gestures.length - 1]).toBe('pan');
  });

  it('пока щипок не кончился, новый палец панораму не начинает', () => {
    make();
    pointer('pointerdown', 1, 300, 200);
    pointer('pointerdown', 2, 500, 200);
    pointer('pointerup', 2, 500, 200);
    // Остался один палец, щипок ещё числится — его снимет отпускание.
    pointer('pointerdown', 3, 100, 100);
    pointer('pointerup', 3, 100, 100);
    pointer('pointerup', 1, 300, 200);
    expect(gestures).toEqual([]);
  });

  it('двойной клик просит вернуть кадр, по удерживаемому элементу — нет', () => {
    make();
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(resets).toBe(1);
    const ghost = document.createElementNS(SVG_NS, 'g');
    ghost.setAttribute('data-move', '{}');
    svg.appendChild(ghost);
    ghost.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(resets).toBe(1);
  });
});

describe('viewport: подгонка и довод', () => {
  const frameOpts = { unit: 10, minW: () => 0, avoid: null };

  it('узкое содержимое растягивается по ширине под аспект стола', () => {
    const vp = make();
    // 4×9 клеток при аспекте 16:9 — высота задаёт кадр.
    expect(vp.frame({ minX: 0, maxX: 4, minY: 0, maxY: 9 }, frameOpts)).toEqual({ x: -60, y: 0, w: 160, h: 90 });
  });

  it('широкое содержимое растягивается по высоте', () => {
    const vp = make();
    expect(vp.frame({ minX: 0, maxX: 32, minY: 0, maxY: 9 }, frameOpts)).toEqual({ x: 0, y: -45, w: 320, h: 180 });
  });

  it('кадр не уже минимума: раздвигается вокруг центра; минимум зависит от ширины стола', () => {
    const vp = make();
    const widths: number[] = [];
    const box = vp.frame(
      { minX: 0, maxX: 16, minY: 0, maxY: 9 },
      { unit: 10, minW: (w) => (widths.push(w), 320), avoid: null },
    );
    expect(box).toEqual({ x: -80, y: -45, w: 320, h: 180 });
    expect(widths).toEqual([800]);
  });

  it('стол ещё не свёрстан: аспект 16:9, ширина для минимума — 1280', () => {
    const vp = make();
    svg.getBoundingClientRect = () => rectOf(0, 0, 0, 0);
    const widths: number[] = [];
    const box = vp.frame(
      { minX: 0, maxX: 16, minY: 0, maxY: 9 },
      { unit: 10, minW: (w) => (widths.push(w), 0), avoid: rectOf(0, 0, 50, 50) },
    );
    expect(box).toEqual({ x: 0, y: 0, w: 160, h: 90 });
    expect(widths).toEqual([1280]);
  });

  it('запретная зона: кадр расширяется, пока содержимое её пересекает', () => {
    const vp = make();
    const bounds = { minX: 0, maxX: 16, minY: 0, maxY: 9 };
    // Зона в правом нижнем углу стола.
    const box = vp.frame(bounds, { ...frameOpts, avoid: rectOf(600, 300, 200, 150) });
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.w).toBeGreaterThan(160);
    // Правый нижний угол содержимого ушёл из-под зоны.
    expect((160 / box.w) * 800 <= 600 || (90 / box.h) * 450 <= 300).toBe(true);
    // Зона в стороне или пустая — кадр не меняется.
    expect(vp.frame(bounds, { ...frameOpts, avoid: rectOf(900, 500, 100, 100) })).toEqual({ x: 0, y: 0, w: 160, h: 90 });
    expect(vp.frame(bounds, { ...frameOpts, avoid: rectOf(600, 300, 0, 0) })).toEqual({ x: 0, y: 0, w: 160, h: 90 });
  });

  it('зона, из-под которой не уйти, останавливает расширение на десяти шагах', () => {
    const vp = make();
    const box = vp.frame({ minX: 0, maxX: 16, minY: 0, maxY: 9 }, { ...frameOpts, avoid: rectOf(0, 0, 800, 450) });
    expect(box.w).toBeCloseTo(160 * Math.pow(1.09, 10), 6);
  });

  it('довод точки: в кадре — ничего; за краем — минимальный плавный сдвиг', () => {
    const vp = make();
    vp.reveal({ x: 400, y: 200 }, 40);
    vi.advanceTimersByTime(500);
    expect(attr()).toEqual([0, 0, 800, 450]);
    vp.reveal({ x: 10, y: 440 }, 40);
    vi.advanceTimersByTime(500);
    expect(attr()).toEqual([-30, 30, 800, 450]);
    vp.reveal({ x: 790, y: 5 }, 40);
    vi.advanceTimersByTime(500);
    expect(attr()).toEqual([0, -5, 800, 450]);
  });
});
