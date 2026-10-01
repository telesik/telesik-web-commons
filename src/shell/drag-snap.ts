// Ход перетягиванием кости из руки: чистая логика жеста —
// «это перетягивание или прокрутка руки» и «к какой тени кость прилипла».
// Без DOM: экранные точки приходят числами, поэтому проверяется юнитами.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Якорь тени на экране: точка, к которой «липнет» кость, и сам вариант. */
export interface SnapAnchor<T> extends Point {
  readonly item: T;
}

/** Порог «палец поехал»: пальцу нужен запас больше, чем мыши (как у стола). */
export const DRAG_START_PX = { mouse: 4, touch: 10 } as const;

/**
 * Кость отлипает дальше, чем прилипает: без запаса она дрожала бы на самой
 * границе радиуса — прилипла, отлипла, снова прилипла.
 */
export const SNAP_RELEASE = 1.25;

/**
 * Соседний вариант перехватывает кость, только когда он заметно ближе
 * текущего: на равном расстоянии от двух теней кость не мечется между ними.
 */
export const SNAP_SWITCH = 0.85;

/**
 * Намерение жеста по смещению от точки нажатия. Рука прокручивается вдоль
 * ряда костей, поэтому палец берёт кость движением поперёк ряда (к столу),
 * а движение вдоль ряда остаётся прокруткой. Мышью рука не прокручивается —
 * кость берётся в любом направлении.
 */
export function dragIntent(dx: number, dy: number, touch: boolean): 'none' | 'drag' | 'scroll' {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (!touch) return Math.hypot(dx, dy) > DRAG_START_PX.mouse ? 'drag' : 'none';
  if (Math.max(ax, ay) <= DRAG_START_PX.touch) return 'none';
  return ay >= ax ? 'drag' : 'scroll';
}

/**
 * К какой тени прилипла кость: ближайший якорь в радиусе. Уже прилипшая
 * кость держится за свой вариант — до SNAP_RELEASE радиуса и пока сосед
 * не окажется ближе в SNAP_SWITCH раз. Совпадение вариантов — по `same`
 * (якоря пересчитываются каждый кадр, ссылки на объекты не живут).
 */
export function pickSnap<T>(
  point: Point,
  anchors: readonly SnapAnchor<T>[],
  radius: number,
  current: T | null,
  same: (a: T, b: T) => boolean,
): T | null {
  let best: SnapAnchor<T> | null = null;
  let bestDist = Infinity;
  let held: SnapAnchor<T> | null = null;
  let heldDist = Infinity;
  for (const a of anchors) {
    const d = Math.hypot(a.x - point.x, a.y - point.y);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
    if (current !== null && same(a.item, current)) {
      held = a;
      heldDist = d;
    }
  }
  if (held && heldDist <= radius * SNAP_RELEASE) {
    return best && best !== held && bestDist < heldDist * SNAP_SWITCH ? best.item : held.item;
  }
  return best && bestDist <= radius ? best.item : null;
}

/**
 * Угол, равный `to` по модулю 360° и ближайший к `from`: кость доворачивается
 * к тени коротким путём, а не через полный оборот.
 */
export function nearestAngle(from: number, to: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta;
}
