// @vitest-environment jsdom
// Каркас: итоги раунда и матча, переход к следующему раунду, договор сторон,
// история ходов, сброс матча, ручки приложения для надстройки и для игры.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sound from '../../src/sound';
import {
  click,
  has,
  KEYS,
  matchOf,
  mountApp,
  playRoundToEnd,
  q,
  readPrefs,
  resume,
  roundOf,
  setValue,
  startFixture,
  toastText,
  unmountApps,
  useFakeClock,
} from './helpers';
import { BASE, lineEngine, type LineVariant } from './toy-game';

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

const overlay = (): HTMLElement => q('#overlay');
const ONE: LineVariant = { hand: 3, rounds: 1 };
/** Раунд, который кончается первым же ходом: игрок 0 выкладывает последнюю кость. */
const lastMove = (variant: LineVariant = BASE): ReturnType<typeof matchOf> =>
  matchOf(roundOf({ hands: [['6-5'], ['2-1']], boneyard: ['1-0'], variant, seed: 21 }));

describe('каркас: итоги раунда', () => {
  it('итоги показываются через 1100 мс после завершающего хода: содержимое игры в рамке каркаса', () => {
    const m = resume(lastMove());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    expect(m.app.getMatch()!.rounds).toHaveLength(1);
    expect(m.app.getMatch()!.totals).toEqual([0, 3]);
    expect(overlay().hidden).toBe(true);
    expect(q('#status-prompt').textContent).toBe('Раунд окончен');
    expect(q('#round-chip').textContent).toBe('раунд 1');
    expect(q('#tutor-bar .tutor-text').textContent).toBe('Раунд окончен');
    expect(readPrefs(m.storage).roundsDone).toBe(1);
    vi.advanceTimersByTime(1100);
    expect(overlay().hidden).toBe(false);
    expect(overlay().querySelector('h2')!.textContent).toBe('Выход');
    expect(overlay().querySelector('.sub')!.textContent).toBe('Победил А');
    expect(overlay().querySelectorAll('.result-grid .result-name')).toHaveLength(2);
    expect(overlay().querySelector('.match-round')!.textContent).toBe('Раунд 1 из 2');
    expect(overlay().querySelector('.match-score')!.textContent).toBe('А 0 : 3 Б');
    expect(overlay().querySelector('.result-note')!.textContent).toBe('Дальше начинает победитель');
    expect(q('[data-action="next-round"]').textContent).toBe('Следующий раунд');
    expect(has('[data-action="abort-match"]')).toBe(true);
    expect(has('[data-action="history"]')).toBe(true);
    // Замеров времени нет — строки времени нет; действий платформы нет — ряда нет.
    expect(overlay().querySelectorAll('.match-round')).toHaveLength(1);
    expect(overlay().querySelector('.action-row')).toBeNull();
    // Ход после конца раунда игнорируется.
    m.app.dispatch({ type: 'pass' });
    expect(m.app.getMatch()!.round.history).toHaveLength(1);
  });

  it('продолженный матч с оконченным раундом сразу показывает итоги', () => {
    const over = lineEngine.applyMove(lastMove().round, { type: 'place', tile: '6-5' });
    const done = matchOf(over, {
      totals: [0, 3],
      rounds: [{ ...over.result!, first: 0, seed: 21, moves: over.history }],
    });
    resume(done);
    expect(overlay().hidden).toBe(false);
    expect(overlay().querySelector('h2')!.textContent).toBe('Выход');
  });

  it('следующий раунд: новая раздача, первым — по правилу игры, тост и звук раздачи', () => {
    const m = resume(lastMove());
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    vi.mocked(sound.playShuffle).mockClear();
    click(q('[data-action="next-round"]'));
    const match = m.app.getMatch()!;
    expect(match.round.phase).toBe('play');
    expect(match.round.history).toEqual([]);
    expect(match.first).toBe(0);
    expect(overlay().hidden).toBe(true);
    expect(toastText()).toBe('Раунд 2: А');
    expect(sound.playShuffle).toHaveBeenCalledTimes(1);
    expect(q('#round-chip').textContent).toBe('раунд 2');
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(4);
  });

  it('надстройка может взять переход на себя; nextRoundWith начинает раунд с общим seed', () => {
    const onNextRoundRequest = vi.fn(() => true);
    const m = resume(lastMove({ hand: 3, rounds: 3 }), { onNextRoundRequest });
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    click(q('[data-action="next-round"]'));
    expect(onNextRoundRequest).toHaveBeenCalledTimes(1);
    expect(m.app.getMatch()!.round.phase).toBe('over');
    m.app.setNextRoundWait({ waiting: true, peerReady: false });
    m.app.nextRoundWith(77);
    expect(m.app.getMatch()!.round.seed).toBe(77);
    expect(toastText()).toBe('Раунд 2: А');
    // Договор сброшен переходом к раунду.
    playRoundToEnd(m.app);
    m.app.setRemoteSeat(1);
    expect(q('[data-action="next-round"]').classList.contains('waiting')).toBe(false);
    // Матч окончен — переход невозможен.
    m.app.nextRoundWith(78);
    playRoundToEnd(m.app);
    expect(m.app.getMatch()!.outcome).not.toBeNull();
    const seed = m.app.getMatch()!.round.seed;
    m.app.nextRoundWith(99);
    expect(m.app.getMatch()!.round.seed).toBe(seed);
  });

  it('договор о следующем раунде: «ждём», «соперник готов», обычный вид; без внешнего места игнорируется', () => {
    const m = resume(lastMove());
    m.app.setRemoteSeat(1);
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    m.app.setNextRoundWait({ waiting: true, peerReady: false });
    expect(q<HTMLButtonElement>('[data-action="next-round"]').disabled).toBe(true);
    expect(q('[data-action="next-round"]').textContent).toBe('Ждём соперника');
    m.app.setNextRoundWait({ waiting: false, peerReady: true });
    expect(q('[data-action="next-round"]').classList.contains('peer-ready')).toBe(true);
    m.app.setNextRoundWait(null);
    expect(q('[data-action="next-round"]').textContent).toBe('Следующий раунд');
    m.app.setNextRoundWait({ waiting: true, peerReady: false });
    m.app.setRemoteSeat(null);
    expect(q<HTMLButtonElement>('[data-action="next-round"]').disabled).toBe(false);
  });

  it('действие платформы на итогах — рядом во всю ширину', () => {
    const onSelect = vi.fn();
    const m = resume(lastMove(), {
      extraActions: [{ id: 'tip', label: () => 'Чаевые', startCard: true, onSelect }],
    });
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    click(q('#overlay .action-row [data-action="x-act:tip"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('время раунда и матча — когда есть честные замеры', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '5-4'], ['5-5', '2-1']], boneyard: [] })));
    m.app.dispatch({ type: 'place', tile: '6-5', t: 61_000 });
    m.app.dispatch({ type: 'place', tile: '5-5', t: 3_600_000 });
    m.app.dispatch({ type: 'place', tile: '5-4' });
    vi.advanceTimersByTime(1100);
    const rows = [...overlay().querySelectorAll('.match-round')].map((e) => e.textContent);
    // Ход без замера на показе получает среднее двух замеренных.
    expect(rows[1]).toBe('время 1:31:32 / 1:31:32');
  });

  it('предложение убрать подсказки: один раз после трёх раундов; «выключить» и «оставить»', () => {
    const m = resume(lastMove(), { prefs: { howtoShown: true, roundsDone: 2 } });
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    expect(readPrefs(m.storage).roundsDone).toBe(3);
    expect(overlay().textContent).toContain('Подсказки больше не нужны?');
    click(q('[data-action="tutor-keep"]'));
    expect(readPrefs(m.storage)).toMatchObject({ tutorAsked: true, tutor: true });
    expect(overlay().textContent).not.toContain('Подсказки больше не нужны?');
    unmountApps();
    const second = resume(lastMove(), { prefs: { howtoShown: true, roundsDone: 5 } });
    second.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    click(q('[data-action="tutor-off"]'));
    expect(readPrefs(second.storage)).toMatchObject({ tutorAsked: true, tutor: false });
    expect(q('#tutor-bar').hidden).toBe(true);
  });
});

describe('каркас: конец матча и сброс', () => {
  it('конец матча: колбэк один раз, заголовок исхода, «Новый матч» сбрасывает всё', () => {
    const onMatchOver = vi.fn();
    const onMatchReset = vi.fn();
    const onMove = vi.fn();
    const m = resume(lastMove(ONE), { onMatchOver, onMatchReset, onMove });
    m.app.dispatch({ type: 'place', tile: '6-5' });
    expect(onMatchOver).toHaveBeenCalledTimes(1);
    expect(onMatchOver.mock.calls[0]![0].outcome).toEqual({ kind: 'win', winner: 0 });
    expect(onMove.mock.invocationCallOrder[0]).toBeLessThan(onMatchOver.mock.invocationCallOrder[0]!);
    vi.advanceTimersByTime(1100);
    expect([...overlay().querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Выход', 'Матч выиграл А']);
    expect(has('[data-action="next-round"]')).toBe(false);
    expect(has('[data-action="abort-match"]')).toBe(false);
    expect(has('[data-action="history"]')).toBe(true);
    click(q('[data-action="new-match"]'));
    expect(m.app.getMatch()).toBeNull();
    expect(m.storage.mem.has(KEYS.match)).toBe(false);
    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(has('#inp-opp')).toBe(true);
    // Сброс оконченного матча кнопкой шапки подтверждения не просит.
    expect(has('[data-action="continue"]')).toBe(false);
  });

  it('ничья в матче — свой заголовок', () => {
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['3-0']], end: 5, boneyard: [], variant: ONE })));
    vi.advanceTimersByTime(1300);
    vi.advanceTimersByTime(1300);
    expect(m.app.getMatch()!.outcome).toEqual({ kind: 'draw' });
    vi.advanceTimersByTime(1100);
    expect([...overlay().querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Блок', 'Ничья']);
    expect(overlay().querySelector('.sub')!.textContent).toBe('Поровну');
  });

  it('бросить недоигранный матч — с подтверждением: и «дверью» шапки, и кнопкой итогов', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const m = resume(lastMove());
    click(q('#btn-new'));
    expect(confirm).toHaveBeenCalledWith('Бросить матч?');
    expect(m.app.getMatch()).not.toBeNull();
    m.app.dispatch({ type: 'place', tile: '6-5' });
    vi.advanceTimersByTime(1100);
    click(q('[data-action="abort-match"]'));
    expect(m.app.getMatch()).not.toBeNull();
    confirm.mockReturnValue(true);
    click(q('[data-action="abort-match"]'));
    expect(m.app.getMatch()).toBeNull();
    expect(overlay().hidden).toBe(false);
    // Без матча «дверь» просто перерисовывает карточку.
    confirm.mockClear();
    click(q('#btn-new'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('новый матч поверх внешнего места снимает его', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' } });
    m.app.setRemoteSeat(0);
    click(q('[data-action="lot"]'));
    click(q('[data-action="start"]'));
    expect(m.spy.api!.remoteSeat()).toBeNull();
    expect(q('#hand-bottom .hand-name').textContent).toContain('Игрок 1');
  });
});

describe('каркас: история ходов', () => {
  /** Настоящий (воспроизводимый по seed) матч: сыграно n ходов первого раунда. */
  function played(n: number): ReturnType<typeof mountApp> {
    const m = mountApp({ prefs: { howtoShown: true } });
    startFixture(m.app);
    m.app.setRemoteSeat(null);
    for (let i = 0; i < n; i++) m.app.dispatch(lineEngine.legalMoves(m.app.getMatch()!.round)[0]!);
    vi.advanceTimersByTime(400);
    return m;
  }

  it('без матча кнопка истории молчит', () => {
    mountApp({ prefs: { howtoShown: true } });
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(true);
  });

  it('просмотр: последний ход, шаги назад и вперёд, к раздаче и к концу, ползунок', () => {
    const m = played(3);
    const moves = m.app.getMatch()!.round.history.length;
    click(q('#btn-hist'));
    expect(q('#btn-hist').classList.contains('active')).toBe(true);
    expect(q('#history-bar').hidden).toBe(false);
    expect(q('#round-chip').textContent).toBe('просмотр 1/1');
    expect(q('#status-event').textContent).toBe('История матча');
    expect(q('#replay-pos').textContent).toBe(`${moves}/${moves}`);
    expect(q<HTMLSelectElement>('#replay-round').options[0]!.textContent).toBe('Раунд 1 — идёт');
    expect(q('#tutor-bar').hidden).toBe(true);
    expect(q('#confirm-bar').hidden).toBe(true);
    expect(m.spy.renders.at(-1)).toBeNull();
    // В истории руки без идентификаторов костей и без приглашений к ходу.
    expect(has('.hand-tile[data-tile]')).toBe(false);
    expect(has('.hand-tile.playable')).toBe(false);
    expect(m.board.renders.at(-1)!.opts.interactive).toBe(false);

    click(q('[data-action="replay-first"]'));
    expect(q('#replay-pos').textContent).toBe(`0/${moves}`);
    expect(q('#status-prompt').innerHTML).toBe('Раздача: <b>А</b>');
    expect(document.querySelectorAll('#boneyard .pile-tile')).toHaveLength(4);
    expect(has('.hand.active')).toBe(false);
    click(q('[data-action="replay-prev"]'));
    expect(q('#replay-pos').textContent).toBe(`0/${moves}`);
    click(q('[data-action="replay-next"]'));
    expect(q('#replay-pos').textContent).toBe(`1/${moves}`);
    // Шаг вперёд на выкладывание анимирует кость.
    expect(m.board.renders.at(-1)!.opts.animateSeq).toBe(0);
    expect(q('#status-prompt').textContent).toContain('А:');
    expect(q('#hand-bottom').classList.contains('active')).toBe(true);
    click(q('[data-action="replay-prev"]'));
    expect(m.board.renders.at(-1)!.opts.animateSeq).toBeNull();
    click(q('[data-action="replay-last"]'));
    expect(q('#replay-pos').textContent).toBe(`${moves}/${moves}`);
    expect(q<HTMLInputElement>('#replay-slider').value).toBe(String(moves));
    setValue('#replay-slider', '1', 'input');
    expect(q('#replay-pos').textContent).toBe(`1/${moves}`);
    // Чужое поле ввода историю не трогает.
    q('#history-bar').insertAdjacentHTML('beforeend', '<input id="other">');
    setValue('#other', '3', 'input');
    expect(q('#replay-pos').textContent).toBe(`1/${moves}`);

    click(q('[data-action="replay-exit"]'));
    expect(q('#history-bar').hidden).toBe(true);
    expect(q('#btn-hist').classList.contains('active')).toBe(false);
    expect(q('#round-chip').textContent).toBe('раунд 1');
    // Кнопки панели после выхода из истории остаются в разметке, но молчат.
    click(q('[data-action="replay-next"]'));
    expect(q('#history-bar').hidden).toBe(true);
    // Кнопка шапки тоже закрывает историю.
    click(q('#btn-hist'));
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(true);
    // Ползунок без открытой истории — мимо.
    document.body.insertAdjacentHTML('beforeend', '<input id="replay-slider"><select id="replay-round"><option value="0"></option></select>');
    setValue('#replay-slider', '0', 'input');
    setValue('#replay-round', '0');
    expect(q('#history-bar').hidden).toBe(true);
  });

  it('с итогов раунда: выбор раунда в списке, выход возвращает итоги', () => {
    const m = played(0);
    playRoundToEnd(m.app);
    vi.advanceTimersByTime(1100);
    click(q('[data-action="next-round"]'));
    m.app.dispatch(lineEngine.legalMoves(m.app.getMatch()!.round)[0]!);
    playRoundToEnd(m.app);
    vi.advanceTimersByTime(1100);
    expect(overlay().hidden).toBe(false);
    click(q('#overlay [data-action="history"]'));
    expect(overlay().hidden).toBe(true);
    const select = q<HTMLSelectElement>('#replay-round');
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe('1');
    expect(select.options[0]!.textContent).toMatch(/^Раунд 1: \d+:\d+$/);
    setValue('#replay-round', '0');
    expect(q('#round-chip').textContent).toBe('просмотр 1/2');
    expect(q('#replay-pos').textContent).toMatch(/^0\//);
    // Смена раунда — не «шаг вперёд»: без анимации.
    click(q('[data-action="replay-last"]'));
    expect(m.board.renders.at(-1)!.opts.animateSeq).toBeNull();
    click(q('[data-action="replay-exit"]'));
    expect(overlay().hidden).toBe(false);
  });

  it('смена языка в истории перестраивает панель и кучу', () => {
    played(2);
    click(q('#btn-hist'));
    click(q('#btn-settings'));
    setValue('#set-lang', 'en');
    expect(q('[data-action="replay-exit"]').dataset.tip).toBe('К игре [en]');
    expect(q('#boneyard .pile-count').textContent).toContain('базар [en]');
    expect(q('#round-chip').textContent).toBe('просмотр [en] 1/1');
  });

  it('внешний ход важнее просмотра: история закрывается, ход применяется', () => {
    const m = played(1);
    click(q('#btn-hist'));
    const next = lineEngine.legalMoves(m.app.getMatch()!.round)[0]!;
    m.app.dispatch(next);
    expect(q('#history-bar').hidden).toBe(true);
    expect(m.app.getMatch()!.round.history).toHaveLength(2);
  });

  it('невоспроизводимый протокол: тост и возврат к игре; раунд без ходов и итогов — историю показать нечем', () => {
    // Позиция из сейва не выводится из seed — воспроизведение хода падает.
    const m = resume(matchOf(roundOf({ hands: [['2-1'], ['4-4']], end: 5, boneyard: ['6-6'] })));
    m.app.dispatch({ type: 'draw' });
    click(q('#btn-hist'));
    expect(toastText()).toMatch(/^Протокол сломан: ход 1:/);
    expect(q('#toast').classList.contains('warn')).toBe(true);
    expect(q('#history-bar').hidden).toBe(true);
    unmountApps();
    const over = lineEngine.applyMove(lastMove().round, { type: 'place', tile: '6-5' });
    resume(matchOf(over));
    click(q('#btn-hist'));
    expect(q('#history-bar').hidden).toBe(true);
  });
});

describe('каркас: ручки для надстройки и для игры', () => {
  it('ручка приложения: матч, рендер, внешнее место', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    expect(m.app.getMatch()).toBeNull();
    // Без матча переход к следующему раунду — no-op.
    m.app.nextRoundWith(5);
    expect(m.app.getMatch()).toBeNull();
    startFixture(m.app, { first: 1, seed: 9 });
    expect(m.app.getMatch()).toMatchObject({ names: ['А', 'Б'], first: 1, bot: null });
    expect(m.app.getMatch()!.round.seed).toBe(9);
    const renders = m.board.renders.length;
    m.app.render();
    expect(m.board.renders.length).toBe(renders + 1);
  });

  it('ручка каркаса для игры: стол, подмена раунда, история, тост, сохранение настроек', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    const api = m.spy.api!;
    expect(api.getMatch()).toBeNull();
    expect(api.isReplay()).toBe(false);
    expect(api.remoteSeat()).toBeNull();
    // Без матча подмена раунда — no-op.
    api.setRound(roundOf());
    expect(api.getMatch()).toBeNull();
    startFixture(m.app);
    expect(api.remoteSeat()).toBe(1);
    const next = roundOf({ hands: [['6-5'], ['2-1']], boneyard: [] });
    api.setRound(next);
    expect(api.getMatch()!.round).toBe(next);
    expect(JSON.parse(m.storage.mem.get(KEYS.match)!).match.round.hands).toEqual(next.hands);
    api.toast('Привет');
    expect(toastText()).toBe('Привет');
    expect(q('#toast').classList.contains('warn')).toBe(false);
    api.toast('Беда', true);
    expect(q('#toast').classList.contains('warn')).toBe(true);
    m.spy.prefs.wide = true;
    api.persistUi();
    expect(readPrefs(m.storage).game).toEqual({ wide: true, hand: 3 });
    const renders = m.board.renders.length;
    api.render();
    expect(m.board.renders.length).toBe(renders + 1);
    expect(api.board.isAutoFit()).toBe(true);
    m.app.dispatch({ type: 'place', tile: '6-5' });
    click(q('#btn-hist'));
    expect(api.isReplay()).toBe(false);
  });

  it('игра без необязательных ручек работает: без монтирования, настроек и переключателей вида', () => {
    const m = resume(matchOf(roundOf({ hands: [['6-5', '3-3'], ['5-4']], boneyard: [] })), { view: { bare: true } });
    expect(m.spy.api).toBeNull();
    expect(m.board.renders.at(-1)!.opts.game).toBeUndefined();
    click(q('#btn-fit'));
    click(q('.hand-tile[data-tile="6-5"]'));
    // Без правила «выбор возвращает автомасштаб» кадр остаётся ручным.
    expect(m.board.autoFit).toBe(false);
    click(q('#board [data-move]'));
    expect(m.app.getMatch()!.round.history).toHaveLength(1);
    click(q('#btn-hist'));
    expect(m.spy.renders).toEqual([]);
  });
});
