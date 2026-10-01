// @vitest-environment jsdom
// Каркас: ход перетягиванием кости из руки — взять, прилипнуть к тени,
// отпустить; мимо теней кость возвращается; жест пальцем и мышью.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  click,
  has,
  matchOf,
  q,
  rectOf,
  resume,
  roundOf,
  unmountApps,
  useFakeClock,
  type Mounted,
} from './helpers';

vi.mock('../../src/sound', () => ({
  playDraw: vi.fn(),
  playPlace: vi.fn(),
  playShuffle: vi.fn(),
  setSoundEnabled: vi.fn(),
}));

beforeEach(() => {
  useFakeClock();
  vi.clearAllMocks();
});
afterEach(() => {
  unmountApps();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tile = (t: string): HTMLElement => q(`.hand-tile[data-tile="${t}"]`);
const clone = (): HTMLElement => q('.flying-tile.drag-tile');

function pointer(
  type: string,
  target: Element,
  x: number,
  y: number,
  o: { id?: number; button?: number; pointerType?: string } = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: o.id ?? 1,
      button: o.button ?? 0,
      pointerType: o.pointerType ?? 'mouse',
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Позиция: на столе 5:5, у игрока 0 две кости к пятёрке и дубль-мимо, ход его. */
function table(opts: Parameters<typeof resume>[1] = {}): Mounted {
  const m = resume(
    matchOf(
      roundOf({
        hands: [['6-5', '5-4', '3-3'], ['5-1', '2-2']],
        boneyard: [],
        end: 5,
        placed: [{ tile: '5-5', values: [5, 5], seq: 0 }],
      }),
    ),
    opts,
  );
  // Кости руки стоят на экране: у нижней руки — внизу, у верхней — вверху.
  for (const el of document.querySelectorAll<HTMLElement>('.hand-tile')) {
    el.getBoundingClientRect = () => rectOf(100, el.closest('#hand-bottom') ? 500 : 20, 40, 80);
  }
  return m;
}

describe('каркас: перетягивание кости', () => {
  it('мышь берёт кость любым движением дальше порога; клон идёт за курсором', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 122, 541);
    expect(has('.drag-tile')).toBe(false);
    pointer('pointermove', document.body, 140, 520);
    expect(has('.drag-tile')).toBe(true);
    expect(tile('6-5').classList.contains('selected')).toBe(true);
    expect(tile('6-5').classList.contains('incoming')).toBe(true);
    expect(m.board.renders.at(-1)!.opts.ghostMoves).toHaveLength(1);
    // Далеко от тени — клон под курсором, вертикально, без прилипания.
    expect(clone().classList.contains('snapped')).toBe(false);
    expect(clone().style.transform).toBe('translate(96.0px, 498.0px) rotate(90.0deg) scale(1.000)');
    // Чужой указатель клон не двигает.
    pointer('pointermove', document.body, 300, 300, { id: 9 });
    expect(clone().style.transform).toBe('translate(96.0px, 498.0px) rotate(90.0deg) scale(1.000)');
  });

  it('у тени кость прилипает; отпускание ставит её, долетая с места тени', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 380, 210);
    expect(clone().classList.contains('snapped')).toBe(true);
    expect(clone().style.transform).toBe('translate(356.0px, 178.0px) rotate(0.0deg) scale(0.909)');
    // Тень, к которой прилипла кость, выглядит как черновик.
    expect(m.board.renders.at(-1)!.opts.pending).toEqual({ type: 'place', tile: '6-5' });
    // Тот же вариант — стол не перерисовывается.
    const renders = m.board.renders.length;
    pointer('pointermove', document.body, 390, 205);
    expect(m.board.renders.length).toBe(renders);
    pointer('pointerup', document.body, 390, 205);
    expect(has('.drag-tile')).toBe(false);
    expect(m.app.getMatch()!.round.history).toEqual([{ type: 'place', tile: '6-5' }]);
    expect(has('.flying-tile.fly-place')).toBe(true);
    // Клик, которым браузер завершает жест, ходом не становится.
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9 });
    q('#board').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Следующий клик — обычный.
    const next = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9 });
    q('#board').dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
  });

  it('уход от тени снимает прилипание; отпускание мимо возвращает кость в руку', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 380, 210);
    expect(clone().classList.contains('snapped')).toBe(true);
    pointer('pointermove', document.body, 700, 480);
    expect(clone().classList.contains('snapped')).toBe(false);
    expect(m.board.renders.at(-1)!.opts.pending).toBeNull();
    pointer('pointerup', document.body, 700, 480);
    expect(m.app.getMatch()!.round.history).toEqual([]);
    expect(clone().classList.contains('returning')).toBe(true);
    expect(tile('6-5').classList.contains('incoming')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(has('.drag-tile')).toBe(false);
    expect(tile('6-5').classList.contains('incoming')).toBe(false);
  });

  it('отмена жеста системой возвращает кость, даже если она прилипла', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 380, 210);
    pointer('pointercancel', document.body, 380, 210, { id: 5 });
    expect(has('.drag-tile')).toBe(true);
    pointer('pointercancel', document.body, 380, 210);
    expect(m.app.getMatch()!.round.history).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(has('.drag-tile')).toBe(false);
  });

  it('возврат кости не трогает руку, если за это время взяли другую кость', () => {
    table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 700, 480);
    pointer('pointerup', document.body, 700, 480);
    // Пока первая летит назад — берём вторую.
    pointer('pointerdown', tile('5-4'), 120, 540);
    pointer('pointermove', document.body, 700, 480);
    vi.advanceTimersByTime(200);
    expect(document.querySelectorAll('.drag-tile')).toHaveLength(1);
    expect(tile('5-4').classList.contains('incoming')).toBe(true);
  });

  it('нажатие без движения — обычный тап; правая кнопка и чужая рука жест не начинают', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointerup', document.body, 120, 540);
    expect(has('.drag-tile')).toBe(false);
    click(tile('6-5'));
    expect(tile('6-5').classList.contains('selected')).toBe(true);
    pointer('pointerdown', tile('5-4'), 120, 540, { button: 2 });
    pointer('pointermove', document.body, 300, 300);
    pointer('pointerdown', tile('5-1'), 120, 60);
    pointer('pointermove', document.body, 300, 300);
    pointer('pointerdown', q('#board'), 300, 300);
    pointer('pointermove', document.body, 400, 300);
    pointer('pointerup', document.body, 400, 300, { id: 4 });
    expect(has('.drag-tile')).toBe(false);
    expect(m.app.getMatch()!.round.history).toEqual([]);
  });

  it('второе нажатие во время жеста новый жест не начинает', () => {
    table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointerdown', tile('5-4'), 120, 540, { id: 2 });
    pointer('pointermove', document.body, 140, 500, { id: 2 });
    expect(has('.drag-tile')).toBe(false);
    pointer('pointermove', document.body, 140, 500);
    expect(tile('6-5').classList.contains('incoming')).toBe(true);
  });

  it('кость без хода покачивается и не берётся', () => {
    table();
    pointer('pointerdown', tile('3-3'), 120, 540);
    pointer('pointermove', document.body, 200, 400);
    expect(has('.drag-tile')).toBe(false);
    expect(tile('3-3').classList.contains('wiggle')).toBe(true);
  });

  it('палец: поперёк ряда — берёт, вдоль ряда — прокрутка руки; кость держится над пальцем', () => {
    table();
    pointer('pointerdown', tile('6-5'), 120, 540, { pointerType: 'touch' });
    pointer('pointermove', document.body, 124, 536, { pointerType: 'touch' });
    expect(has('.drag-tile')).toBe(false);
    pointer('pointermove', document.body, 160, 545, { pointerType: 'touch' });
    expect(has('.drag-tile')).toBe(false);
    // Жест признан прокруткой — дальнейшие движения его не возобновляют.
    pointer('pointermove', document.body, 160, 400, { pointerType: 'touch' });
    expect(has('.drag-tile')).toBe(false);
    pointer('pointerdown', tile('6-5'), 120, 540, { pointerType: 'pen' });
    pointer('pointermove', document.body, 125, 500, { pointerType: 'pen' });
    // Нижняя рука: кость на 34 px выше пальца.
    expect(clone().style.transform).toBe('translate(81.0px, 444.0px) rotate(90.0deg) scale(1.000)');
  });

  it('верхняя рука: кость держится ниже пальца', () => {
    resume(
      matchOf(
        roundOf({
          hands: [['6-5'], ['5-1', '2-2']],
          boneyard: [],
          current: 1,
          end: 5,
          placed: [{ tile: '5-5', values: [5, 5], seq: 0 }],
        }),
      ),
    );
    for (const el of document.querySelectorAll<HTMLElement>('.hand-tile')) {
      el.getBoundingClientRect = () => rectOf(100, 20, 40, 80);
    }
    pointer('pointerdown', q('.hand-tile[data-tile="5-1"]'), 120, 60, { pointerType: 'touch' });
    pointer('pointermove', document.body, 125, 100, { pointerType: 'touch' });
    expect(clone().style.transform).toBe('translate(81.0px, 112.0px) rotate(90.0deg) scale(1.000)');
  });

  it('тень лежит младшим числом вперёд — клон довёрнут на пол-оборота коротким путём', () => {
    const m = table();
    m.board.reversed = true;
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 380, 210);
    expect(clone().style.transform).toContain('rotate(180.0deg)');
  });

  it('подтверждение ходов: отпущенная на тень кость становится черновиком', () => {
    const m = table({ prefs: { howtoShown: true, confirm: true } });
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 380, 210);
    pointer('pointerup', document.body, 380, 210);
    expect(m.app.getMatch()!.round.history).toEqual([]);
    expect(q('#confirm-bar').hidden).toBe(false);
    expect(has('.drag-tile')).toBe(false);
  });

  it('выбор кости при пустом столе возвращает автомасштаб и при перетягивании', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '5-4'], ['5-1']], boneyard: [] })), {
      prefs: { howtoShown: true, autoFit: false },
    });
    pointer('pointerdown', tile('6-5'), 0, 0);
    pointer('pointermove', document.body, 30, 30);
    expect(m.board.autoFit).toBe(true);
  });

  it('тени ещё не посчитаны — прилипать не к чему; радиус не меньше пальца', () => {
    const m = table();
    m.board.ghostPose = () => ({ x: 400, y: 200, angle: 0, scale: 10 });
    pointer('pointerdown', tile('6-5'), 120, 540);
    // 40 px от тени при длине кости 10 px: держит минимальный радиус 44 px.
    pointer('pointermove', document.body, 430, 226);
    expect(clone().classList.contains('snapped')).toBe(true);
    pointer('pointermove', document.body, 700, 480);
    // Стол не отдаёт теней: кость просто идёт за курсором.
    m.board.noTargets = true;
    pointer('pointermove', document.body, 400, 200);
    expect(clone().classList.contains('snapped')).toBe(false);
  });

  it('жест теряет смысл (чужой ход, история, конец раунда) — кость бросается', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(true);
    m.app.setRemoteSeat(0);
    expect(has('.drag-tile')).toBe(false);
    expect(has('.hand-tile.incoming')).toBe(false);
    // Отпускание после сброса — уже не жест.
    pointer('pointerup', document.body, 300, 300);
    m.app.setRemoteSeat(null);
    // Жест жив, пока позиция та же: рендер его не трогает.
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 300, 300);
    m.app.render();
    expect(has('.drag-tile')).toBe(true);
    // Нажатие без движения рендер тоже переживает.
    pointer('pointerup', document.body, 300, 300);
    vi.advanceTimersByTime(200);
    pointer('pointerdown', tile('5-4'), 120, 540);
    m.app.render();
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(true);
  });

  it('кость нельзя взять в чужой ход, в истории и когда её уже нет в руке', () => {
    const m = table();
    pointer('pointerdown', tile('6-5'), 120, 540);
    // До порога пришёл внешний ход: кость ушла из руки.
    m.app.dispatch({ type: 'place', tile: '6-5' });
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(false);
    // Нажали на свою кость, а к порогу ход уже не наш.
    vi.advanceTimersByTime(400);
    const mine = q('.hand-tile[data-tile="5-1"]');
    mine.getBoundingClientRect = () => rectOf(100, 20, 40, 80);
    pointer('pointerdown', mine, 120, 60);
    m.app.setRemoteSeat(1);
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(false);
    // В чужой ход нажатие жест не начинает вовсе.
    pointer('pointerdown', q('.hand-tile[data-tile="5-1"]'), 120, 60);
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(false);
  });

  it('захват указателя недоступен — жест идёт без него', () => {
    table();
    Element.prototype.setPointerCapture = () => {
      throw new Error('указатель уже отпущен');
    };
    pointer('pointerdown', tile('6-5'), 120, 540);
    pointer('pointermove', document.body, 300, 300);
    expect(has('.drag-tile')).toBe(true);
  });
});
