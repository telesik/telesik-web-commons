// @vitest-environment jsdom
// Каркас: ход раунда через DOM — выбор кости, тени, подтверждение, добор,
// обязательная кость, автопас, бот, внешнее место, закрытые руки, замер времени.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sound from '../../src/sound';
import {
  click,
  has,
  KEYS,
  matchOf,
  q,
  readPrefs,
  rectOf,
  resume,
  scrollToStub,
  roundOf,
  setChecked,
  startFixture,
  mountApp,
  toastText,
  unmountApps,
  useFakeClock,
} from './helpers';
import { BASE, lineEngine, type LineMove } from './toy-game';

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
const ghostEls = (): SVGElement[] => [...document.querySelectorAll<SVGElement>('#board [data-move]')];
const hist = (m: { app: { getMatch(): { round: { history: readonly LineMove[] } } | null } }): readonly LineMove[] =>
  m.app.getMatch()!.round.history;

/** Позиция: ход игрока 0, все три кости играбельны, у соперника к пятёрке ничего нет. */
const open = (): ReturnType<typeof matchOf> =>
  matchOf(roundOf({ hands: [['6-5', '5-4', '3-3'], ['4-2', '6-6']], boneyard: ['1-0', '5-1'], seed: 11 }));

describe('каркас: выбор кости и ход по тени', () => {
  it('клик выбирает кость, тени появляются; повторный клик снимает выбор', () => {
    const m = resume(open());
    expect(document.querySelectorAll('#hand-bottom .hand-tile.playable')).toHaveLength(3);
    expect(q('#hand-bottom').classList.contains('active')).toBe(true);
    expect(q('#hand-bottom .turn-mark').title).toBe('Ходит');
    expect(q('#hand-bottom .first-chip').textContent).toBe('первый');
    expect(q('#hand-top .hand-sum').textContent).toBe('костей: 2, очков: 18');
    expect(q('#status-event').textContent).toBe('Новый раунд');
    expect(q('#status-prompt').innerHTML).toBe('<b>А</b>: ваш ход');
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Выберите кость');
    expect(ghostEls()).toHaveLength(0);
    click(tile('6-5'));
    expect(tile('6-5').classList.contains('selected')).toBe(true);
    expect(ghostEls()).toHaveLength(1);
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Выбрана 6:5');
    // Место хода в кадре: выбор кости при пустом столе возвращает автомасштаб.
    click(q('#btn-fit'));
    click(tile('6-5'));
    expect(tile('6-5').classList.contains('selected')).toBe(false);
    expect(m.board.autoFit).toBe(false);
    click(tile('3-3'));
    expect(m.board.autoFit).toBe(true);
    // Дубль — две тени (два варианта раскладки).
    expect(ghostEls()).toHaveLength(2);
    expect(m.board.renders.at(-1)!.opts.game).toEqual({ wide: false, flip: false });
  });

  it('ход по тени: кость уходит из руки, стук, сохранение, колбэк платформы, полёт клона', () => {
    const onMove = vi.fn();
    const m = resume(open(), { onMove });
    click(tile('6-5'));
    click(ghostEls()[0]);
    expect(hist(m)).toEqual([{ type: 'place', tile: '6-5' }]);
    expect(sound.playPlace).toHaveBeenCalledWith('accent');
    expect(onMove).toHaveBeenCalledWith({ type: 'place', tile: '6-5' }, m.app.getMatch()!.round);
    expect(JSON.parse(m.storage.mem.get(KEYS.match)!).match.round.history).toHaveLength(1);
    expect(q('#status-event').textContent).toBe('А: 6:5');
    // Клон летит к месту, кость на столе скрыта до конца полёта.
    expect(has('.flying-tile.fly-place')).toBe(true);
    expect(q('#board .placed[data-seq="0"]').classList.contains('incoming')).toBe(true);
    expect(m.board.renders.at(-1)!.opts.animateSeq).toBe(0);
    vi.advanceTimersByTime(400);
    expect(has('.flying-tile')).toBe(false);
    expect(q('#board .placed[data-seq="0"]').classList.contains('incoming')).toBe(false);
    // Автомасштаб включён — довод кости в кадр не нужен.
    expect(m.board.ensured).toEqual([]);
  });

  it('автомасштаб выключен — кость доводится в кадр; стол не свёрстан — полёт сразу кончается', () => {
    // На столе уже лежит кость: выбор следующей автомасштаб не возвращает.
    const started = matchOf(
      roundOf({
        hands: [['6-5', '5-4'], ['4-2', '6-6']],
        boneyard: [],
        end: 5,
        placed: [{ tile: '5-5', values: [5, 5], seq: 0 }],
      }),
    );
    const m = resume(started, { prefs: { howtoShown: true, autoFit: false } });
    m.board.placedPose = null;
    click(tile('6-5'));
    click(ghostEls()[0]);
    expect(m.board.autoFit).toBe(false);
    expect(m.board.ensured).toEqual([1]);
    vi.advanceTimersByTime(20);
    expect(has('.flying-tile')).toBe(false);
  });

  it('новый полёт отменяет прежний; второй стук — обычный', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '3-3'], ['5-4', '2-2']], boneyard: [] })));
    m.app.dispatch({ type: 'place', tile: '6-5' });
    expect(document.querySelectorAll('.flying-tile')).toHaveLength(1);
    m.app.dispatch({ type: 'place', tile: '5-4' });
    expect(document.querySelectorAll('.flying-tile')).toHaveLength(1);
    expect(sound.playPlace).toHaveBeenLastCalledWith('normal');
    vi.advanceTimersByTime(400);
    expect(has('.flying-tile')).toBe(false);
  });

  it('единственная играбельная кость выбирается сама', () => {
    resume(matchOf(roundOf({ hands: [['6-5'], ['5-4']], boneyard: [] })));
    expect(tile('6-5').classList.contains('selected')).toBe(true);
    expect(ghostEls()).toHaveLength(1);
  });

  it('кость без хода покачивается; чужая рука не кликается', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '2-1'], ['5-4', '4-4']], end: 5, boneyard: [] })));
    expect(tile('2-1').classList.contains('dimmed')).toBe(true);
    click(tile('2-1'));
    expect(tile('2-1').classList.contains('wiggle')).toBe(true);
    click(tile('5-4'));
    expect(tile('5-4').classList.contains('selected')).toBe(false);
    expect(hist(m)).toEqual([]);
  });

  it('второй клик двойного клика по тени гасится: 300 мс после хода клики не ходят', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '3-3'], ['5-4', '5-5']], boneyard: [] })));
    click(tile('6-5'));
    click(ghostEls()[0]);
    click(tile('5-4'));
    click(ghostEls()[0]);
    expect(hist(m)).toHaveLength(1);
    vi.advanceTimersByTime(300);
    click(ghostEls()[0]);
    expect(hist(m)).toHaveLength(2);
  });

  it('нелегальный ход извне не применяется, ошибка в консоли', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = resume(open());
    m.app.dispatch({ type: 'pass' });
    expect(hist(m)).toEqual([]);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('обучение выключается галочкой на панели подсказки', () => {
    const m = resume(open());
    const cb = q<HTMLInputElement>('#tutor-bar [data-tutor-toggle]');
    // Чужое событие и «включение» ничего не меняют.
    q('#tutor-bar').dispatchEvent(new Event('change', { bubbles: true }));
    setChecked(cb, true);
    expect(q('#tutor-bar').hidden).toBe(false);
    setChecked(q<HTMLInputElement>('#tutor-bar [data-tutor-toggle]'), false);
    expect(q('#tutor-bar').hidden).toBe(true);
    expect(readPrefs(m.storage)).toMatchObject({ tutor: false, tutorAsked: true });
  });

  it('рука подъезжает к первой играбельной кости, если та за краем, — один раз на ход', () => {
    const scrollTo = scrollToStub;
    scrollTo.mockClear();
    const tileRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('hand-tile') ? rectOf(900, 0, 40, 80) : rectOf(0, 0, 300, 80);
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
    const m = resume(open());
    expect(scrollTo).toHaveBeenCalledWith({ left: 872, behavior: 'smooth' });
    // Повторный рендер того же хода руку не дёргает.
    scrollTo.mockClear();
    m.app.render();
    expect(scrollTo).not.toHaveBeenCalled();
    // Кость в кадре — прокрутка не нужна.
    tileRect.mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('hand-tile') ? rectOf(20, 0, 40, 80) : rectOf(0, 0, 300, 80);
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 40 });
    click(tile('6-5'));
    click(ghostEls()[0]);
    m.app.dispatch({ type: 'draw' });
    expect(scrollTo).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
  });
});

describe('каркас: подтверждение хода', () => {
  const confirmOn = { prefs: { howtoShown: true, confirm: true } };

  it('клик по тени выбирает ход; подтверждает повторный клик не раньше 350 мс или кнопка', () => {
    const m = resume(open(), confirmOn);
    click(tile('3-3'));
    const [a, b] = ghostEls();
    click(a);
    expect(hist(m)).toEqual([]);
    expect(q('#confirm-bar').hidden).toBe(false);
    expect(q('#confirm-bar .confirm-q').textContent).toBe('Поставить 3:3?');
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Подтвердите ход');
    expect(m.board.renders.at(-1)!.opts.pending).toEqual({ type: 'place', tile: '3-3', side: 0 });
    // Случайный двойной клик подтверждением не считается.
    click(ghostEls()[0]);
    expect(hist(m)).toEqual([]);
    // Другая тень — другой черновик.
    click(ghostEls()[1]);
    expect(m.board.renders.at(-1)!.opts.pending).toEqual({ type: 'place', tile: '3-3', side: 1 });
    vi.advanceTimersByTime(350);
    click(ghostEls()[1]);
    expect(hist(m)).toEqual([{ type: 'place', tile: '3-3', side: 1 }]);
    expect(q('#confirm-bar').hidden).toBe(true);
    void a;
    void b;
  });

  it('кнопки панели: «Поставить» ходит, «Отмена» снимает черновик; чужой клик по панели — мимо', () => {
    const m = resume(open(), confirmOn);
    click(tile('6-5'));
    click(ghostEls()[0]);
    click(q('#confirm-bar .confirm-q'));
    click(q('#confirm-no'));
    expect(q('#confirm-bar').hidden).toBe(true);
    expect(hist(m)).toEqual([]);
    click(ghostEls()[0]);
    click(q('#confirm-yes'));
    expect(hist(m)).toEqual([{ type: 'place', tile: '6-5' }]);
  });

  it('черновик живёт, пока выбрана его кость, и снимается выключением режима', () => {
    const m = resume(open(), confirmOn);
    click(tile('6-5'));
    click(ghostEls()[0]);
    expect(q('#confirm-bar').hidden).toBe(false);
    click(tile('5-4'));
    expect(q('#confirm-bar').hidden).toBe(true);
    click(ghostEls()[0]);
    click(q('#btn-settings'));
    setChecked(q<HTMLInputElement>('#settings input[data-set="confirm"]'), false);
    expect(q('#confirm-bar').hidden).toBe(true);
    expect(readPrefs(m.storage).confirm).toBe(false);
  });

  it('черновик, ставший нелегальным, снимается сам; в чужой ход черновика нет', () => {
    const m = resume(open(), confirmOn);
    click(tile('6-5'));
    click(ghostEls()[0]);
    // Раунд подменён игрой: выбранной кости в руке больше нет.
    m.spy.api!.setRound(roundOf({ hands: [['2-2', '1-1'], ['4-2']], boneyard: [] }));
    expect(q('#confirm-bar').hidden).toBe(true);
    click(tile('2-2'));
    click(ghostEls()[0]);
    expect(q('#confirm-bar').hidden).toBe(false);
    m.app.setRemoteSeat(0);
    expect(q('#confirm-bar').hidden).toBe(true);
    expect(has('.hand-tile.selected')).toBe(false);
  });

  it('черновик не той кости снимается, когда ход стал обязательным другой костью', () => {
    const m = resume(open(), confirmOn);
    click(tile('6-5'));
    click(ghostEls()[0]);
    expect(q('#confirm-bar').hidden).toBe(false);
    // Раунд подменён: теперь игрок обязан сходить вытянутой костью.
    m.spy.api!.setRound(roundOf({ hands: [['6-5', '5-4'], ['4-2']], end: 5, forced: '5-4', boneyard: [] }));
    expect(tile('5-4').classList.contains('selected')).toBe(true);
    expect(q('#confirm-bar').hidden).toBe(true);
  });

  it('добор и пас подтверждения не ждут', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['4-4']], end: 5, boneyard: ['6-6'] })), confirmOn);
    m.board.hooks!.onMove({ type: 'draw' });
    expect(hist(m)).toEqual([{ type: 'draw' }]);
  });
});

describe('каркас: базар', () => {
  /** Ход игрока 0, к пятёрке ничего нет, в базаре сначала подходящая кость. */
  const needDraw = (): ReturnType<typeof matchOf> =>
    matchOf(roundOf({ hands: [['2-1', '3-3'], ['4-4']], end: 5, boneyard: ['5-0', '6-6'] }));

  it('куча рисуется по числу костей базара, подпись со счётом, разрешён добор', () => {
    resume(needDraw());
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(2);
    expect(q('#boneyard .pile-count').textContent).toBe('базар: 2');
    expect(q('#boneyard').classList.contains('can-draw')).toBe(true);
    expect(q('#status-prompt').innerHTML).toBe('<b>А</b>: берите из базара');
  });

  it('клик по кости кучи тянет: звук, полёт в руку, вытянутая кость обязательна', () => {
    const m = resume(needDraw());
    click(q('[data-pile]'));
    expect(hist(m)).toEqual([{ type: 'draw' }]);
    expect(sound.playDraw).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(1);
    expect(has('.flying-tile')).toBe(true);
    expect(tile('5-0').classList.contains('incoming')).toBe(true);
    expect(tile('5-0').classList.contains('must')).toBe(true);
    expect(tile('5-0').classList.contains('selected')).toBe(true);
    vi.advanceTimersByTime(20);
    expect(q<HTMLElement>('.flying-tile').style.opacity).toBe('0.15');
    vi.advanceTimersByTime(430);
    expect(has('.flying-tile')).toBe(false);
    expect(tile('5-0').classList.contains('incoming')).toBe(false);
    // Другую кость взять нельзя — тост; обязательная не снимается кликом.
    click(tile('3-3'));
    expect(toastText()).toBe('Обязаны сходить 5:0');
    expect(q('#toast').classList.contains('warn')).toBe(true);
    click(tile('5-0'));
    expect(tile('5-0').classList.contains('selected')).toBe(true);
    vi.advanceTimersByTime(2600);
    expect(q('#toast').hidden).toBe(true);
  });

  it('добор не применился — полёта нет', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = resume(needDraw());
    vi.spyOn(lineEngine, 'applyMove').mockImplementationOnce(() => {
      throw new Error('сбой движка');
    });
    click(q('[data-pile]'));
    expect(hist(m)).toEqual([]);
    expect(err).toHaveBeenCalledTimes(1);
    expect(has('.flying-tile')).toBe(false);
  });

  it('есть ход — куча трясётся и объясняет; сразу после хода клик по куче гасится', () => {
    const m = resume(open());
    click(q('[data-pile]'));
    expect(q('#boneyard').classList.contains('shake')).toBe(true);
    expect(toastText()).toBe('Есть ход');
    expect(hist(m)).toEqual([]);
    expect(q('#boneyard').classList.contains('can-draw')).toBe(false);
    m.app.dispatch({ type: 'place', tile: '6-5' });
    // Ход соперника: добор ему доступен, но клик в первые 300 мс после хода — эхо двойного клика.
    click(q('[data-pile]'));
    expect(hist(m)).toHaveLength(1);
    vi.advanceTimersByTime(300);
    click(q('[data-pile]'));
    expect(hist(m)).toHaveLength(2);
  });

  it('тянуть нечем и ходить нечем — «сейчас нельзя»; в чужой ход и после конца раунда — тоже', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['5-4']], end: 5, boneyard: [] })));
    // Базар пуст: кучи нет, клик в зону не попадает; зовём обработчик напрямую через кость-заглушку.
    q('#boneyard').insertAdjacentHTML('beforeend', '<div class="pile-tile" data-pile="0"></div>');
    click(q('[data-pile]'));
    expect(toastText()).toBe('Сейчас тянуть нельзя');
    unmountApps();

    const r = resume(needDraw());
    r.app.setRemoteSeat(0);
    click(q('[data-pile]'));
    expect(toastText()).toBe('Сейчас тянуть нельзя');
    expect(hist(r)).toEqual([]);
    unmountApps();

    const over = resume(matchOf(roundOf({ hands: [['6-5'], ['2-1']], boneyard: ['1-0'] })));
    over.app.dispatch({ type: 'place', tile: '6-5' });
    q('#toast').hidden = true;
    click(q('[data-pile]'));
    expect(toastText()).toBe('');
  });

  it('клик мимо костей, но в границах кучи, тянет ближайшую; вне зоны и поверх контролов — нет', () => {
    const m = resume(needDraw());
    const pileTiles = [...document.querySelectorAll<HTMLElement>('#boneyard .pile-tile')];
    Object.defineProperty(pileTiles[0], 'offsetWidth', { value: 80 });
    Object.defineProperty(pileTiles[0], 'offsetHeight', { value: 40 });
    q('#boneyard').getBoundingClientRect = () => rectOf(500, 300, 300, 200);
    pileTiles[0]!.getBoundingClientRect = () => rectOf(520, 320, 80, 40);
    pileTiles[1]!.getBoundingClientRect = () => rectOf(700, 420, 80, 40);
    // Вне зоны — ничего.
    click(q('#table'), { clientX: 10, clientY: 10 });
    expect(hist(m)).toEqual([]);
    // Кость руки в границах зоны важнее кучи.
    click(tile('2-1'), { clientX: 600, clientY: 400 });
    expect(hist(m)).toEqual([]);
    // Просвет между костями: улетает ближайшая.
    click(q('#table'), { clientX: 690, clientY: 430 });
    expect(hist(m)).toEqual([{ type: 'draw' }]);
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(1);
  });

  it('зона кучи не работает под открытым оверлеем и в истории', () => {
    const m = mountApp({ prefs: { howtoShown: true }, saved: needDraw() });
    // Оверлей стартовой карточки открыт: клик по столу в «зоне» ничего не тянет.
    click(q('#table'), { clientX: 600, clientY: 400 });
    expect(m.app.getMatch()).toBeNull();
    unmountApps();
    // История: куча без номеров костей, клики по ней и по её зоне не тянут.
    const r = mountApp({ prefs: { howtoShown: true } });
    startFixture(r.app);
    r.app.setRemoteSeat(null);
    r.app.dispatch(lineEngine.legalMoves(r.app.getMatch()!.round)[0]!);
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(false);
    expect(has('[data-pile]')).toBe(false);
    q('#boneyard').insertAdjacentHTML('beforeend', '<div class="pile-tile" data-pile="0"></div>');
    click(q('[data-pile]'));
    click(q('#table'), { clientX: 600, clientY: 400 });
    expect(hist(r)).toHaveLength(1);
  });

  it('продолженный раунд: разобранные кости кучи уже погашены; куча догоняет добор мимо клика', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['4-4']], end: 5, boneyard: ['6-6'] })));
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(1);
    m.app.dispatch({ type: 'draw' });
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(0);
    expect(q('#boneyard .pile-count').textContent).toBe('базар: 0');
    // Повторный рендер без изменений кучу не перестраивает.
    const before = q('#boneyard').firstChild;
    m.app.render();
    expect(q('#boneyard').firstChild).toBe(before);
  });
});

describe('каркас: автопас', () => {
  it('единственный ход — пас: тост один раз и пас сам через 1300 мс', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['5-4', '4-4']], end: 5, boneyard: [] })), {}, false);
    expect(toastText()).toBe('А: пас');
    q('#toast').hidden = true;
    m.app.render();
    expect(toastText()).toBe('');
    vi.advanceTimersByTime(1299);
    expect(hist(m)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(hist(m)).toEqual([{ type: 'pass' }]);
  });

  it('пас внешнего места локально не разыгрывается', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['5-4', '4-4']], end: 5, boneyard: [] })));
    m.app.setRemoteSeat(0);
    vi.advanceTimersByTime(5000);
    expect(hist(m)).toEqual([]);
  });
});

describe('каркас: пауза ввода', () => {
  const myTurn = (): ReturnType<typeof matchOf> =>
    matchOf(roundOf({ hands: [['6-5', '2-2'], ['5-4', '4-4']], boneyard: ['5-5'] }));

  it('на паузе своё место не ходит: рука не приглашает, клики и добор глухи, dispatch применяется', () => {
    const m = resume(myTurn());
    expect(has('.hand-tile.playable')).toBe(true);
    m.app.setInputHold(true);
    expect(has('.hand-tile.playable')).toBe(false);
    click(tile('6-5'));
    expect(has('.hand-tile.selected')).toBe(false);
    click(q('[data-pile]'));
    expect(toastText()).toBe('Сейчас тянуть нельзя');
    expect(hist(m)).toEqual([]);
    // Ход своего же места, пришедший извне (догон после сверки), применяется.
    m.app.dispatch({ type: 'place', tile: '6-5' });
    expect(hist(m)).toHaveLength(1);
  });

  it('пауза снята — рука снова приглашает', () => {
    const m = resume(myTurn());
    m.app.setInputHold(true);
    m.app.setInputHold(false);
    expect(has('.hand-tile.playable')).toBe(true);
    m.board.hooks!.onMove({ type: 'place', tile: '6-5' });
    expect(hist(m)).toHaveLength(1);
  });

  it('пас на паузе сам не разыгрывается; после снятия — как обычно', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['5-4', '4-4']], end: 5, boneyard: [] })));
    m.app.setInputHold(true);
    vi.advanceTimersByTime(5000);
    expect(hist(m)).toEqual([]);
    m.app.setInputHold(false);
    vi.advanceTimersByTime(1300);
    expect(hist(m)).toEqual([{ type: 'pass' }]);
  });

  it('матч с внешним игроком начинается без паузы', () => {
    const m = resume(myTurn());
    m.app.setInputHold(true);
    m.app.startRemoteMatch({ names: ['А', 'Б'], first: 0, variant: m.app.getMatch()!.variant, seed: 7, remoteSeat: 1 });
    expect(has('.hand-tile.playable')).toBe(true);
  });
});

describe('каркас: бот и внешнее место', () => {
  const withBot = (): ReturnType<typeof matchOf> =>
    matchOf(roundOf({ hands: [['6-5', '2-2'], ['5-4', '4-4']], boneyard: ['5-5'], seed: 3 }), {
      names: ['А', 'Лёгкий бот'],
      bot: { player: 1, level: 'easy' },
    });

  it('бот ходит сам через паузу; в его ход рука человека не приглашает и не кликается', () => {
    const choose = vi.spyOn(lineEngine as Required<typeof lineEngine>, 'chooseBotMove');
    const m = resume(withBot());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    expect(q('#status-prompt').innerHTML).toBe('<b>Лёгкий бот</b>: думает');
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Ходит бот');
    expect(has('.hand-tile.playable')).toBe(false);
    expect(q('#boneyard').classList.contains('can-draw')).toBe(false);
    m.board.hooks!.onMove({ type: 'place', tile: '5-4' });
    click(q('.hand-tile[data-tile="5-4"]'));
    expect(hist(m)).toHaveLength(1);
    vi.advanceTimersByTime(750);
    // Пауза бота — тоже время на ход.
    expect(hist(m)).toEqual([
      { type: 'place', tile: '6-5' },
      { type: 'place', tile: '5-4', t: 750 },
    ]);
    expect(choose).toHaveBeenCalledWith(
      expect.objectContaining({ current: 1 }),
      expect.objectContaining({ seat: 1, level: 'easy', totals: [0, 0] }),
    );
    expect(Number.isInteger(choose.mock.calls[0]![1].seed)).toBe(true);
  });

  it('добор бота звучит; куча догоняет базар', () => {
    const m = resume(
      matchOf(roundOf({ hands: [['6-5', '2-2'], ['4-4']], boneyard: ['1-1'] }), { bot: { player: 1, level: 'normal' } }),
    );
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(750);
    expect(hist(m).at(-1)).toEqual({ type: 'draw', t: 750 });
    expect(sound.playDraw).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(0);
  });

  it('сбой бота не роняет приложение; таймер бота гаснет, если ход уже не его', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(lineEngine as Required<typeof lineEngine>, 'chooseBotMove').mockImplementationOnce(() => {
      throw new Error('бот сломался');
    });
    const m = resume(withBot());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(750);
    expect(err).toHaveBeenCalledTimes(1);
    expect(hist(m)).toHaveLength(1);
    unmountApps();

    // Матч с ботом со стартовой карточки; человек сходил, открыл историю — бот ждёт.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const r = mountApp({ prefs: { howtoShown: true, opponent: 'easy' } });
    click(q('[data-action="lot"]'));
    click(q('[data-action="start"]'));
    vi.advanceTimersByTime(400);
    click(q('.hand-tile.playable[data-tile]'));
    click(ghostEls()[0]);
    expect(hist(r)).toHaveLength(1);
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(false);
    vi.advanceTimersByTime(750);
    expect(hist(r)).toHaveLength(1);
  });

  it('внешнее место: его рука сверху, ход ждём нейтральной строкой, свой ход — снизу', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    startFixture(m.app, { remoteSeat: 0, first: 0 });
    // Место 0 — у соперника: внизу рука места 1.
    expect(q('#hand-bottom .hand-name').textContent).toContain('Б');
    expect(q('#hand-top').classList.contains('active')).toBe(true);
    expect(q('#status-prompt').innerHTML).toBe('<b>А</b>: думает');
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Ходит соперник');
    expect(sound.playShuffle).toHaveBeenCalledTimes(1);
    expect(toastText()).toBe('Первым ходит А');
    expect(m.spy.renders.at(-1)).toMatchObject({ remote: true });
    // Стол узнаёт, чьё место внизу экрана.
    expect(m.board.renders.at(-1)!.opts.game).toEqual({ wide: false, flip: true });
    m.app.setRemoteSeat(null);
    expect(q('#hand-bottom .hand-name').textContent).toContain('А');
    expect(m.spy.renders.at(-1)).toMatchObject({ remote: false });
    expect(m.board.renders.at(-1)!.opts.game).toEqual({ wide: false, flip: false });
  });

  it('закрытая рука соперника: рубашки без идентификаторов костей; журнал не называет чужой добор', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    startFixture(m.app, { variant: { ...BASE, hidden: true }, remoteSeat: 1 });
    expect(document.querySelectorAll('#hand-top .hand-tile')).toHaveLength(3);
    expect(document.querySelectorAll('#hand-top .hand-tile[data-tile]')).toHaveLength(0);
    expect(q('#hand-top').innerHTML).toContain('class="emblem"');
    expect(q('#hand-top .hand-sum').textContent).toBe('костей: 3');
    expect(document.querySelectorAll('#hand-bottom .hand-tile[data-tile]')).toHaveLength(3);
    unmountApps();
    const r = resume(
      matchOf(roundOf({ hands: [['2-1'], ['4-4', '5-0']], end: 5, boneyard: ['6-6'], variant: { ...BASE, hidden: true } })),
    );
    r.app.setRemoteSeat(0);
    r.app.dispatch({ type: 'draw' });
    expect(q('#status-event').textContent).toBe('А: добор');
    // Кость закрытой руки в DOM не названа — её полёт стартует от самой руки.
    r.app.setRemoteSeat(1);
    r.app.dispatch({ type: 'place', tile: '5-0' });
    expect(has('.flying-tile.fly-place')).toBe(true);
  });
});

describe('каркас: время на ход', () => {
  const two = (): ReturnType<typeof matchOf> =>
    matchOf(roundOf({ hands: [['6-5', '4-3'], ['5-4', '4-4']], boneyard: [] }));

  it('свой ход получает честное t; внешний — нет; ход с готовым t не трогаем', () => {
    const m = resume(two());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1200);
    click(tile('5-4'));
    click(ghostEls()[0]);
    expect(hist(m)[1]).toEqual({ type: 'place', tile: '5-4', t: 1200 });
    expect(hist(m)[0]).toEqual({ type: 'place', tile: '6-5' });
  });

  it('уход приложения с глаз портит замер текущего хода', () => {
    for (const fire of [
      () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      },
      () => window.dispatchEvent(new Event('pagehide')),
      () => document.dispatchEvent(new Event('freeze')),
    ]) {
      const m = resume(two());
      m.app.dispatch({ type: 'place', tile: '6-5' });
      vi.advanceTimersByTime(500);
      fire();
      click(tile('5-4'));
      click(ghostEls()[0]);
      expect(hist(m)[1]).toEqual({ type: 'place', tile: '5-4' });
      unmountApps();
    }
    // Видимость вернулась — событие без скрытия замер не портит.
    const m = resume(two());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(500);
    document.dispatchEvent(new Event('visibilitychange'));
    click(tile('5-4'));
    click(ghostEls()[0]);
    expect(hist(m)[1]).toEqual({ type: 'place', tile: '5-4', t: 500 });
  });

  it('позиция показана скрытому окну — ход без замера; просмотр истории портит замер', () => {
    const m = resume(two());
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    m.app.dispatch({ type: 'place', tile: '6-5' });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.advanceTimersByTime(500);
    click(tile('5-4'));
    click(ghostEls()[0]);
    expect(hist(m)[1]).toEqual({ type: 'place', tile: '5-4' });
    vi.advanceTimersByTime(500);
    click(q('#btn-hist'));
    click(q('#btn-hist'));
    click(tile('4-3'));
    click(ghostEls()[0]);
    expect(hist(m)[2]).toEqual({ type: 'place', tile: '4-3' });
  });
});
