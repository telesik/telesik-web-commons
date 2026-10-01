// Логика хода перетягиванием: намерение жеста и
// прилипание кости к вариантам позиции — без DOM.
import { describe, expect, it } from 'vitest';
import { dragIntent, nearestAngle, pickSnap, SNAP_RELEASE, type SnapAnchor } from '../../src/shell/drag-snap';

const same = (a: string, b: string): boolean => a === b;
// Прямо и два поворота одного конца плюс далёкий второй конец.
const anchors: SnapAnchor<string>[] = [
  { item: 'straight', x: 100, y: 100 },
  { item: 'turn0', x: 60, y: 60 },
  { item: 'turn1', x: 60, y: 140 },
  { item: 'far', x: 400, y: 100 },
];

describe('перетягивание: намерение жеста', () => {
  it('мышь берёт кость в любом направлении, но не от дрожания', () => {
    expect(dragIntent(2, 2, false)).toBe('none');
    expect(dragIntent(5, 0, false)).toBe('drag');
    expect(dragIntent(0, -5, false)).toBe('drag');
  });

  it('палец: поперёк ряда — кость, вдоль ряда — прокрутка руки', () => {
    expect(dragIntent(6, -8, true)).toBe('none');
    expect(dragIntent(3, -14, true)).toBe('drag');
    expect(dragIntent(3, 14, true)).toBe('drag');
    expect(dragIntent(14, 3, true)).toBe('scroll');
    expect(dragIntent(-14, -3, true)).toBe('scroll');
    // Ровно по диагонали — кость: прокрутку в этом случае браузер не начал.
    expect(dragIntent(12, -12, true)).toBe('drag');
  });
});

describe('перетягивание: прилипание к вариантам позиции', () => {
  it('вне радиуса кость свободна; теней нет — тоже', () => {
    expect(pickSnap({ x: 250, y: 100 }, anchors, 50, null, same)).toBeNull();
    expect(pickSnap({ x: 100, y: 100 }, [], 50, null, same)).toBeNull();
  });

  it('в радиусе встаёт на ближайшую тень', () => {
    expect(pickSnap({ x: 110, y: 95 }, anchors, 50, null, same)).toBe('straight');
    expect(pickSnap({ x: 66, y: 70 }, anchors, 50, null, same)).toBe('turn0');
    expect(pickSnap({ x: 380, y: 90 }, anchors, 50, null, same)).toBe('far');
  });

  it('движение пальца меняет вариант, когда сосед заметно ближе', () => {
    // На полпути между «прямо» и поворотом кость держится за свой вариант…
    expect(pickSnap({ x: 81, y: 81 }, anchors, 50, 'straight', same)).toBe('straight');
    expect(pickSnap({ x: 79, y: 79 }, anchors, 50, 'turn0', same)).toBe('turn0');
    // …а подведённая к повороту — перещёлкивается на него.
    expect(pickSnap({ x: 68, y: 66 }, anchors, 50, 'straight', same)).toBe('turn0');
    expect(pickSnap({ x: 68, y: 134 }, anchors, 50, 'turn0', same)).toBe('turn1');
  });

  it('отлипает дальше, чем прилипает, и после отлипания свободна', () => {
    const edge = { x: 100 + 50 * SNAP_RELEASE - 1, y: 100 };
    expect(pickSnap(edge, anchors, 50, null, same)).toBeNull();
    expect(pickSnap(edge, anchors, 50, 'straight', same)).toBe('straight');
    const out = { x: 100 + 50 * SNAP_RELEASE + 1, y: 100 };
    expect(pickSnap(out, anchors, 50, 'straight', same)).toBeNull();
  });

  it('уведённая от своей тени к другому концу прилипает уже к нему', () => {
    expect(pickSnap({ x: 390, y: 100 }, anchors, 50, 'straight', same)).toBe('far');
  });

  it('прежний вариант исчез из теней — выбор заново', () => {
    expect(pickSnap({ x: 100, y: 100 }, anchors, 50, 'gone', same)).toBe('straight');
    expect(pickSnap({ x: 250, y: 100 }, anchors, 50, 'gone', same)).toBeNull();
  });
});

describe('перетягивание: доворот кости', () => {
  it('ближайший равный угол — коротким путём', () => {
    expect(nearestAngle(90, 0)).toBe(0);
    expect(nearestAngle(90, 270)).toBe(-90);
    expect(nearestAngle(90, 180)).toBe(180);
    expect(nearestAngle(350, 10)).toBe(370);
    expect(nearestAngle(-170, 170)).toBe(-190);
    expect(nearestAngle(90, 90)).toBe(90);
  });
});
