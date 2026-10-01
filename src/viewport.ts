// Кадр стола: viewBox SVG-сцены и жесты над ним — панорама перетаскиванием,
// зум колесом и щипком, плавный переезд кадра, подгонка под содержимое.
// Что лежит на столе, модуль не знает: границы содержимого называет игра.

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Жест пользователя над кадром. */
export type ViewGesture = 'pan' | 'pinch' | 'wheel';

/** Границы содержимого в клетках сцены. */
export interface ContentBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface FrameOptions {
  /** Размер клетки сцены в единицах viewBox. */
  readonly unit: number;
  /** Минимальная ширина кадра по ширине стола на экране, px. */
  minW(viewWidth: number): number;
  /**
   * Прямоугольник на экране, который содержимое не должно пересекать
   * (например, куча базара поверх стола); null — такого нет.
   */
  readonly avoid: DOMRect | null;
}

export interface ViewportOptions {
  readonly initial: ViewBox;
  /** Пределы ширины кадра при зуме. */
  readonly minW: number;
  readonly maxW: number;
  /**
   * Элементы, которые жесты кадра не перехватывают: нажатие на них не
   * начинает панораму, двойной клик не просит вернуть кадр.
   */
  readonly holdSelector: string;
  /** Пользователь сдвинул кадр или изменил масштаб. */
  onGesture(kind: ViewGesture): void;
  /** Двойной клик по столу: просьба вернуть кадр к содержимому. */
  onReset(): void;
}

export interface Viewport {
  get(): ViewBox;
  /** Поставить кадр — сразу или плавным переездом. */
  set(next: ViewBox, animate: boolean): void;
  /** Последнее нажатие стало панорамой или щипком: клик после него — не клик. */
  dragged(): boolean;
  /**
   * Кадр под содержимое: по аспекту стола на экране, не уже минимума, без
   * пересечения с запретной зоной.
   */
  frame(bounds: ContentBounds, opts: FrameOptions): ViewBox;
  /** Довести экранную точку в кадр минимальным сдвигом. */
  reveal(pt: { readonly x: number; readonly y: number }, margin: number): void;
}

/** Длительность плавного переезда кадра, мс. */
const TWEEN_MS = 260;

export function createViewport(svg: SVGSVGElement, opts: ViewportOptions): Viewport {
  let vb: ViewBox = { ...opts.initial };
  let tweenHandle = 0;

  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  apply();

  function apply(): void {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  function set(next: ViewBox, animate: boolean): void {
    cancelAnimationFrame(tweenHandle);
    if (!animate) {
      vb = next;
      apply();
      return;
    }
    const from = { ...vb };
    const t0 = performance.now();
    const step = (t: number): void => {
      const k = Math.min(1, (t - t0) / TWEEN_MS);
      const e = 1 - Math.pow(1 - k, 3);
      vb = {
        x: from.x + (next.x - from.x) * e,
        y: from.y + (next.y - from.y) * e,
        w: from.w + (next.w - from.w) * e,
        h: from.h + (next.h - from.h) * e,
      };
      apply();
      if (k < 1) tweenHandle = requestAnimationFrame(step);
    };
    tweenHandle = requestAnimationFrame(step);
  }

  // --- Панорама и зум --------------------------------------------------------

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let vbStart = vb;
  let moved = false;

  // Порог «это драг, а не клик»: пальцу нужен запас больше, чем мыши, —
  // тап легко уезжает на 5–8 px.
  const DRAG_PX = matchMedia('(pointer: coarse)').matches ? 10 : 4;

  // Мультитач: активные указатели и состояние щипка (дистанция и центр
  // прошлого замера в экранных px; шаги применяются инкрементально).
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; cx: number; cy: number } | null = null;

  function pinchFrom(pts: { x: number; y: number }[]): { d: number; cx: number; cy: number } {
    const [a, b] = [pts[0]!, pts[1]!];
    return {
      d: Math.hypot(b.x - a.x, b.y - a.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  /**
   * Зум кадра в k раз вокруг экранной точки (cx, cy): мировая точка под ней
   * остаётся на месте, ширина зажата в пределы. Кадр не применяется:
   * вызывающий может ещё сдвинуть его (панорама щипка) и применяет сам.
   */
  function zoomAt(cx: number, cy: number, k: number): void {
    const rect = svg.getBoundingClientRect();
    const w = Math.min(opts.maxW, Math.max(opts.minW, vb.w * k));
    const kk = w / vb.w;
    const px = vb.x + ((cx - rect.left) / rect.width) * vb.w;
    const py = vb.y + ((cy - rect.top) / rect.height) * vb.h;
    cancelAnimationFrame(tweenHandle);
    vb = { x: px - (px - vb.x) * kk, y: py - (py - vb.y) * kk, w, h: vb.h * kk };
  }

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return; // панорама и клики — только основной кнопкой
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      // Второй палец превращает драг в щипок; кликом это уже не станет.
      dragging = false;
      moved = true;
      pinch = pinchFrom([...pointers.values()]);
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (pointers.size > 2 || pinch) return;
    moved = false;
    // Захват указателя — только когда начинается панорама: захват на svg
    // ретаргетит события, и клик по элементу стола перестал бы находить цель.
    if ((ev.target as Element).closest(opts.holdSelector)) return;
    dragging = true;
    dragStart = { x: ev.clientX, y: ev.clientY };
    vbStart = { ...vb };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (pinch && pointers.size >= 2) {
      const cur = pinchFrom([...pointers.values()]);
      if (cur.d < 1 || pinch.d < 1) return;
      // Зум вокруг мировой точки под центром щипка…
      zoomAt(pinch.cx, pinch.cy, pinch.d / cur.d);
      // …плюс панорама на смещение самого центра.
      const scale = vb.w / svg.getBoundingClientRect().width;
      vb = { ...vb, x: vb.x - (cur.cx - pinch.cx) * scale, y: vb.y - (cur.cy - pinch.cy) * scale };
      apply();
      pinch = cur;
      opts.onGesture('pinch');
      return;
    }
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const scale = vb.w / rect.width;
    const dx = (ev.clientX - dragStart.x) * scale;
    const dy = (ev.clientY - dragStart.y) * scale;
    if (Math.abs(ev.clientX - dragStart.x) + Math.abs(ev.clientY - dragStart.y) > DRAG_PX) {
      moved = true;
    }
    if (moved) {
      cancelAnimationFrame(tweenHandle);
      vb = { ...vb, x: vbStart.x - dx, y: vbStart.y - dy };
      apply();
    }
  });
  const endDrag = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pinch) {
      // Щипок закончился (или потерял палец): остаток не превращаем в драг,
      // чтобы стол не прыгал; следующий pointerdown начнёт жест заново.
      // Если пальцев всё ещё два и больше — пересеваем замер по оставшимся.
      pinch = pointers.size >= 2 ? pinchFrom([...pointers.values()]) : null;
      return;
    }
    if (dragging && moved) opts.onGesture('pan');
    dragging = false;
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      zoomAt(ev.clientX, ev.clientY, ev.deltaY > 0 ? 1.15 : 1 / 1.15);
      apply();
      opts.onGesture('wheel');
    },
    { passive: false },
  );

  svg.addEventListener('dblclick', (ev) => {
    // Двойной клик по элементу стола — работа с ним, а не с камерой.
    if ((ev.target as Element).closest(opts.holdSelector)) return;
    opts.onReset();
  });

  function frame(b: ContentBounds, o: FrameOptions): ViewBox {
    let minX = b.minX;
    let minY = b.minY;
    const rect = svg.getBoundingClientRect();
    const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    let w = (b.maxX - b.minX) * o.unit;
    let h = (b.maxY - b.minY) * o.unit;
    // Подгоняем под аспект стола на экране, чтобы содержимое занимало кадр целиком.
    if (w / h < aspect) {
      const w2 = h * aspect;
      minX -= (w2 - w) / 2 / o.unit;
      w = w2;
    } else {
      const h2 = w / aspect;
      minY -= (h2 - h) / 2 / o.unit;
      h = h2;
    }
    const scale = Math.max(1, o.minW(rect.width || 1280) / w);
    if (scale > 1) {
      // Раздвигаем кадр вокруг центра, сохраняя аспект.
      minX -= (w * (scale - 1)) / 2 / o.unit;
      minY -= (h * (scale - 1)) / 2 / o.unit;
      w *= scale;
      h *= scale;
    }
    return avoid(
      { x: minX * o.unit, y: minY * o.unit, w, h },
      { x0: b.minX * o.unit, y0: b.minY * o.unit, x1: b.maxX * o.unit, y1: b.maxY * o.unit },
      rect,
      o.avoid,
    );
  }

  /**
   * Запретная зона лежит поверх стола. Пока содержимое пересекает её на
   * экране, кадр расширяется от левого верхнего угла — содержимое уезжает
   * к нему, из-под зоны.
   */
  function avoid(
    box: ViewBox,
    raw: { x0: number; y0: number; x1: number; y1: number },
    sr: DOMRect,
    zone: DOMRect | null,
  ): ViewBox {
    if (!zone || zone.width === 0 || sr.width === 0) return box;
    const px0 = zone.left - sr.left;
    const py0 = zone.top - sr.top;
    let out = box;
    for (let i = 0; i < 10; i++) {
      const sx1 = ((raw.x1 - out.x) / out.w) * sr.width;
      const sy1 = ((raw.y1 - out.y) / out.h) * sr.height;
      const sx0 = ((raw.x0 - out.x) / out.w) * sr.width;
      const sy0 = ((raw.y0 - out.y) / out.h) * sr.height;
      const hit =
        sx1 > px0 && sx0 < zone.right - sr.left && sy1 > py0 && sy0 < zone.bottom - sr.top;
      if (!hit) break;
      out = { x: out.x, y: out.y, w: out.w * 1.09, h: out.h * 1.09 };
    }
    return out;
  }

  function reveal(pt: { readonly x: number; readonly y: number }, margin: number): void {
    const rect = svg.getBoundingClientRect();
    const x = pt.x - rect.left;
    const y = pt.y - rect.top;
    let dx = 0;
    let dy = 0;
    if (x < margin) dx = x - margin;
    else if (x > rect.width - margin) dx = x - (rect.width - margin);
    if (y < margin) dy = y - margin;
    else if (y > rect.height - margin) dy = y - (rect.height - margin);
    if (dx === 0 && dy === 0) return;
    const k = vb.w / rect.width;
    set({ ...vb, x: vb.x + dx * k, y: vb.y + dy * k }, true);
  }

  return { get: () => vb, set, dragged: () => moved, frame, reveal };
}
