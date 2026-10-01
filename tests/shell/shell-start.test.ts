// @vitest-environment jsdom
// Каркас: старт приложения, стартовая карточка, жребий, настройки, сохранения.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sound from '../../src/sound';
import {
  click,
  has,
  i18n,
  KEYS,
  makeStorage,
  matchOf,
  mountApp,
  q,
  readPrefs,
  roundOf,
  setChecked,
  setValue,
  toastText,
  unmountApps,
  useFakeClock,
} from './helpers';
import { BASE, lineEngineNoBot } from './toy-game';

vi.mock('../../src/sound', () => ({
  playDraw: vi.fn(),
  playPlace: vi.fn(),
  playShuffle: vi.fn(),
  setSoundEnabled: vi.fn(),
}));

beforeEach(() => {
  useFakeClock();
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  unmountApps();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const overlay = (): HTMLElement => q('#overlay');
const options = (sel: string): string[] => [...q<HTMLSelectElement>(sel).options].map((o) => o.value);

describe('каркас: первый запуск и настройки из хранилища', () => {
  it('первый запуск: вопрос об обучении, язык по умолчанию, обучение включено', () => {
    const m = mountApp();
    expect(m.spy.howtoAsk).toHaveLength(1);
    expect(i18n.getLocale()).toBe('ru');
    expect(overlay().hidden).toBe(false);
    expect(overlay().querySelector('.tutor-hint')).not.toBeNull();
    expect(sound.setSoundEnabled).toHaveBeenCalledWith(true);
    // «Показать»: флаг сохранён, слайды открыты.
    m.spy.howtoAsk[0]!.onShow();
    expect(readPrefs(m.storage).howtoShown).toBe(true);
    expect(m.spy.howto).toHaveLength(1);
    // Повторный ответ флаг не перезаписывает.
    m.storage.mem.delete(KEYS.ui);
    m.spy.howtoAsk[0]!.onLater();
    expect(m.storage.mem.has(KEYS.ui)).toBe(false);
  });

  it('«Позже» тоже ставит флаг; у игравших раньше вопроса нет', () => {
    const first = mountApp();
    first.spy.howtoAsk[0]!.onLater();
    expect(readPrefs(first.storage).howtoShown).toBe(true);
    unmountApps();
    const again = mountApp({ prefs: { sound: true } });
    expect(again.spy.howtoAsk).toHaveLength(0);
  });

  it('сохранённые настройки применяются: язык, звук, обучение, имена, соперник, переключатели платформы', () => {
    const onChange = vi.fn();
    const m = mountApp({
      prefs: {
        locale: 'en',
        sound: false,
        tutor: false,
        confirm: true,
        opponent: 'human',
        p1Name: 'Очень длинное имя игрока',
        p2Name: 'Второй',
        toggles: { awake: true },
        roundsDone: 4.7,
        game: { wide: true, hand: 5 },
      },
      extraToggles: [
        { id: 'awake', label: () => 'Не гасить экран', initial: false, onChange },
        { id: 'other', label: () => 'Другое', initial: true, onChange },
      ],
    });
    expect(i18n.getLocale()).toBe('en');
    expect(sound.setSoundEnabled).toHaveBeenCalledWith(false);
    expect(overlay().querySelector('.tutor-hint')).toBeNull();
    expect(q<HTMLInputElement>('#inp-n0').value).toBe('Очень длинное им');
    expect(q<HTMLInputElement>('#inp-n1').value).toBe('Второй');
    expect(q<HTMLSelectElement>('#inp-opp').value).toBe('human');
    expect(onChange.mock.calls).toEqual([[true], [true]]);
    expect(m.spy.prefs).toEqual({ wide: true, hand: 5 });
  });

  it('испорченные настройки — значения по умолчанию, приложение стартует', () => {
    for (const raw of ['{не json', 'null', '5']) {
      const onChange = vi.fn();
      const storage = makeStorage({ [KEYS.ui]: raw });
      const m = mountApp({
        storage,
        extraToggles: [{ id: 'awake', label: () => 'Не гасить экран', initial: true, onChange }],
      });
      expect(i18n.getLocale()).toBe('ru');
      expect(q<HTMLSelectElement>('#inp-opp').value).toBe('easy');
      expect(onChange).toHaveBeenCalledWith(true);
      // Настройки были — вопрос об обучении не задаётся.
      expect(m.spy.howtoAsk).toHaveLength(0);
      unmountApps();
    }
  });

  it('неизвестный сохранённый соперник игнорируется; игровые настройки в корне читаются из корня', () => {
    const m = mountApp({ prefs: { opponent: 'ghost', wide: true, hand: 5 }, view: { prefsFlat: true } });
    expect(q<HTMLSelectElement>('#inp-opp').value).toBe('easy');
    expect(m.spy.prefs).toEqual({ wide: true, hand: 5 });
    setValue('#inp-n0', 'Аня');
    expect(readPrefs(m.storage)).toMatchObject({ wide: true, hand: 5, p1Name: 'Аня' });
    expect(readPrefs(m.storage).game).toBeUndefined();
  });

  it('без поля game игровые настройки — по умолчанию, пишутся в поле game', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    expect(m.spy.prefs).toEqual({ wide: false, hand: 3 });
    setValue('#inp-n0', 'Аня');
    expect(readPrefs(m.storage).game).toEqual({ wide: false, hand: 3 });
  });

  it('без хранилища в опциях берётся localStorage', () => {
    mountApp({ noStorage: true });
    setValue('#inp-n0', 'Аня');
    expect(JSON.parse(localStorage.getItem(KEYS.ui)!).p1Name).toBe('Аня');
  });

  it('нет нужной разметки страницы — понятная ошибка', () => {
    expect(() => mountApp({ page: '<div id="app"></div>' })).toThrow('Нет элемента #round-chip');
  });

  it('логотип в шапке ставится один раз; без шапки — без логотипа', () => {
    mountApp({ prefs: { howtoShown: true } });
    expect(document.querySelectorAll('#topbar .brand-logo')).toHaveLength(1);
    expect(q('#btn-settings').innerHTML).toContain('<svg');
    unmountApps();
    // Разметка с уже вставленным логотипом и без блока .brand.
    const page = document.body.innerHTML;
    mountApp({ prefs: { howtoShown: true }, page });
    expect(document.querySelectorAll('#topbar .brand-logo')).toHaveLength(1);
    unmountApps();
    mountApp({ prefs: { howtoShown: true }, page: page.replace('class="brand"', 'class="nobrand"') });
    expect(document.querySelectorAll('.brand-logo')).toHaveLength(1);
  });
});

describe('каркас: стартовая карточка', () => {
  it('состав карточки: заголовок игры, ссылки платформы, язык, соперники, поля игры, версия', () => {
    mountApp({
      prefs: { howtoShown: true },
      supportUrl: 'https://example.org/support',
      appStoreUrl: 'https://example.org/appstore',
      googlePlayUrl: 'https://example.org/play',
    });
    const card = overlay();
    expect(card.querySelector('h1')!.innerHTML).toBe('<span>Линия</span>');
    expect(card.querySelector('.sub')!.textContent).toBe('Слоган');
    const links = [...card.querySelectorAll<HTMLAnchorElement>('.links-line a')];
    expect(links.map((a) => a.textContent)).toEqual(['Как играть', 'Поддержать', 'App Store', 'Google Play']);
    expect(options('#inp-lang-start')).toEqual(['en', 'ru']);
    expect(options('#inp-opp')).toEqual(['human', 'easy', 'normal', 'strong']);
    expect(has('#inp-hidden')).toBe(true);
    expect(card.querySelector('.version-line')!.innerHTML).toBe(
      'версия 1.2.3 (<a href="https://example.org/rules" target="_blank" rel="noopener">правила 0.1</a>, abc1234)',
    );
    expect(q('#version-badge').innerHTML).toBe(card.querySelector('.version-line')!.innerHTML);
    expect(q<HTMLButtonElement>('#btn-start').disabled).toBe(true);
    expect(has('[data-action="continue"]')).toBe(false);
    // Подсказки кнопок шапки.
    expect(q('#btn-hist').dataset.tip).toBe('История');
    expect(q('#btn-settings').dataset.tip).toBe('Настройки');
  });

  it('без ссылок платформы остаётся только «Как играть»; клик открывает слайды', () => {
    const m = mountApp();
    expect([...overlay().querySelectorAll('.links-line a')]).toHaveLength(1);
    click(q('[data-action="howto"]'));
    expect(m.spy.howto).toHaveLength(1);
    // Закрытие слайдов отмечает обучение показанным.
    m.spy.howto[0]!.onClose!();
    expect(readPrefs(m.storage).howtoShown).toBe(true);
  });

  it('игра без игры вдвоём и без бота: в селекторе только пункты платформы', () => {
    mountApp({
      prefs: { howtoShown: true },
      view: { hotSeat: false },
      engine: lineEngineNoBot,
      opponentOptions: [{ id: 'ble', label: () => 'По Bluetooth' }],
      onOpponentStart: vi.fn(),
    });
    expect(options('#inp-opp')).toEqual(['ble']);
    expect(q<HTMLSelectElement>('#inp-opp').value).toBe('ble');
    unmountApps();
    // Совсем без пунктов: соперник по умолчанию остаётся человеком.
    mountApp({ prefs: { howtoShown: true }, view: { hotSeat: false }, engine: lineEngineNoBot });
    expect(options('#inp-opp')).toEqual([]);
    unmountApps();
    mountApp({ prefs: { howtoShown: true }, engine: lineEngineNoBot });
    expect(q<HTMLSelectElement>('#inp-opp').value).toBe('human');
  });

  it('жребий: две кости, имя первого, кнопка старта оживает; старт начинает матч', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0);
    const onMatchReset = vi.fn();
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' }, onMatchReset });
    click(q('[data-action="start"]'));
    expect(m.app.getMatch()).toBeNull();
    setValue('#inp-n0', '  Аня  ');
    click(q('[data-action="lot"]'));
    expect(document.querySelectorAll('#lot-row .lot-side')).toHaveLength(2);
    // Первая кость 6-6, вторая 0-0: меньше сумма у второго.
    expect(document.querySelectorAll('#lot-row .lot-side')[1]!.classList.contains('win')).toBe(true);
    expect(q('#lot-result').innerHTML).toBe('Первым ходит <b>Игрок 2</b>');
    expect(q<HTMLButtonElement>('#btn-start').disabled).toBe(false);
    click(q('[data-action="start"]'));
    const match = m.app.getMatch()!;
    expect(match.names).toEqual(['Аня', 'Игрок 2']);
    expect(match.first).toBe(1);
    expect(match.bot).toBeNull();
    expect(match.variant).toEqual(BASE);
    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(overlay().hidden).toBe(true);
    expect(sound.playShuffle).toHaveBeenCalledTimes(1);
    expect(toastText()).toBe('Первым ходит Игрок 2');
    expect(JSON.parse(m.storage.mem.get(KEYS.match)!).v).toBe(2);
    expect(q('#round-chip').textContent).toBe('раунд 1');
  });

  it('жребий в пользу первого игрока; имя по умолчанию; вариант из полей игры', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' } });
    setValue('#inp-n0', '   ');
    setValue('#inp-n1', 'Боря');
    q<HTMLInputElement>('#inp-hidden').checked = true;
    click(q('[data-action="lot"]'));
    expect(document.querySelectorAll('#lot-row .lot-side')[0]!.classList.contains('win')).toBe(true);
    click(q('[data-action="start"]'));
    const match = m.app.getMatch()!;
    expect(match.names).toEqual(['Игрок 1', 'Боря']);
    expect(match.first).toBe(0);
    expect(match.variant).toEqual({ ...BASE, hidden: true });
  });

  it('бот: второго имени нет, имя бота говорит об уровне', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    for (const [level, name] of [
      ['easy', 'Лёгкий бот'],
      ['normal', 'Обычный бот'],
      ['strong', 'Сильный бот'],
    ] as const) {
      vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
      const m = mountApp({ prefs: { howtoShown: true, opponent: level } });
      expect(has('#inp-n1')).toBe(false);
      expect(q('label[for="inp-n0"]').textContent).toBe('Ваше имя');
      click(q('[data-action="lot"]'));
      click(q('[data-action="start"]'));
      expect(m.app.getMatch()!.names[1]).toBe(name);
      expect(m.app.getMatch()!.bot).toEqual({ player: 1, level });
      unmountApps();
    }
  });

  it('имена запоминаются; смена соперника перестраивает карточку, сохраняя введённое', () => {
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' } });
    expect(q('label[for="inp-n0"]').textContent).toBe('Имя игрока');
    setValue('#inp-n0', 'Аня');
    setValue('#inp-n1', 'Боря');
    expect(readPrefs(m.storage)).toMatchObject({ p1Name: 'Аня', p2Name: 'Боря' });
    q<HTMLInputElement>('#inp-n0').value = 'Не сохранено';
    q<HTMLInputElement>('#inp-hidden').checked = true;
    setValue('#inp-opp', 'easy');
    expect(readPrefs(m.storage).opponent).toBe('easy');
    expect(q<HTMLInputElement>('#inp-n0').value).toBe('Не сохранено');
    expect(q<HTMLInputElement>('#inp-hidden').checked).toBe(true);
    expect(has('#inp-n1')).toBe(false);
    setValue('#inp-opp', 'human');
    expect(q<HTMLInputElement>('#inp-n1').value).toBe('Боря');
  });

  it('смена языка на карточке: тексты нового языка, введённые имена и галочки игры сохранены', () => {
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' } });
    q<HTMLInputElement>('#inp-n0').value = 'Аня';
    q<HTMLInputElement>('#inp-n1').value = 'Боря';
    q<HTMLInputElement>('#inp-hidden').checked = true;
    const before = m.spy.staticTexts;
    setValue('#inp-lang-start', 'en');
    expect(readPrefs(m.storage)).toMatchObject({ locale: 'en', p1Name: 'Аня', p2Name: 'Боря' });
    expect(overlay().querySelector('.sub')!.textContent).toBe('Слоган [en]');
    expect(q<HTMLInputElement>('#inp-n0').value).toBe('Аня');
    expect(q<HTMLInputElement>('#inp-hidden').checked).toBe(true);
    expect(q('#btn-hist').dataset.tip).toBe('История [en]');
    expect(m.spy.staticTexts).toBe(before + 1);
    expect(q('#version-badge').innerHTML).toContain('версия [en]');
  });

  it('смена языка: имена по умолчанию не запоминаются; игра без сохраняемых галочек', () => {
    const m = mountApp({ prefs: { howtoShown: true, opponent: 'human' }, view: { bare: true } });
    setValue('#inp-lang-start', 'en');
    expect(readPrefs(m.storage)).toMatchObject({ p1Name: '', p2Name: '' });
    expect(q<HTMLInputElement>('#inp-n0').value).toBe('Игрок 1 [en]');
    setValue('#inp-opp', 'easy');
    expect(q<HTMLInputElement>('#inp-n0').value).toBe('Игрок 1 [en]');
    // Поле игры без обработчика изменений — настройки не пишутся.
    const raw = m.storage.mem.get(KEYS.ui);
    setValue('input[name="line-hand"][value="5"]', '5');
    expect(m.storage.mem.get(KEYS.ui)).toBe(raw);
  });

  it('поле игры на карточке меняет игровые настройки и сохраняется', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    setValue('input[name="line-hand"][value="5"]', '5');
    expect(readPrefs(m.storage).game).toEqual({ wide: false, hand: 5 });
    // Чужое поле — не игровое: ничего не сохраняется.
    const raw = m.storage.mem.get(KEYS.ui);
    q<HTMLInputElement>('#inp-hidden').dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.storage.mem.get(KEYS.ui)).toBe(raw);
  });

  it('пункт соперника от платформы: свои подписи, без жребия и второго имени, старт уходит надстройке', () => {
    const onOpponentStart = vi.fn();
    const m = mountApp({
      prefs: { howtoShown: true, opponent: 'ble' },
      opponentOptions: [
        {
          id: 'ble',
          label: () => 'По <Bluetooth>',
          needsLots: false,
          needsSecondName: false,
          startLabel: () => 'Найти соперника',
          nameLabel: () => 'Игровое имя',
        },
        { id: 'net', label: () => 'По сети' },
      ],
      onOpponentStart,
    });
    expect(options('#inp-opp')).toEqual(['human', 'easy', 'normal', 'strong', 'ble', 'net']);
    expect(q('#inp-opp option[value="ble"]').textContent).toBe('По <Bluetooth>');
    expect(q('label[for="inp-n0"]').textContent).toBe('Игровое имя');
    expect(has('[data-action="lot"]')).toBe(false);
    expect(has('#lot-row')).toBe(false);
    expect(q('#btn-start').textContent).toBe('Найти соперника');
    expect(q<HTMLButtonElement>('#btn-start').disabled).toBe(false);
    setValue('#inp-n0', 'Аня');
    click(q('[data-action="start"]'));
    expect(onOpponentStart).toHaveBeenCalledWith('ble', { names: ['Аня', 'Игрок 2'], first: 0, variant: BASE });
    expect(m.app.getMatch()).toBeNull();
    // Пункт с жребием: до жребия старт молчит, после — уходит надстройке с первым по жребию.
    setValue('#inp-opp', 'net');
    click(q('[data-action="start"]'));
    expect(onOpponentStart).toHaveBeenCalledTimes(1);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0);
    click(q('[data-action="lot"]'));
    click(q('[data-action="start"]'));
    expect(onOpponentStart).toHaveBeenLastCalledWith('net', { names: ['Аня', 'Игрок 2'], first: 1, variant: BASE });
  });

  it('обработчик старта без пунктов соперника ничего не добавляет', () => {
    mountApp({ prefs: { howtoShown: true }, onOpponentStart: vi.fn() });
    expect(options('#inp-opp')).toEqual(['human', 'easy', 'normal', 'strong']);
  });

  it('пункты соперника без обработчика старта не показываются', () => {
    mountApp({ prefs: { howtoShown: true, opponent: 'ble' }, opponentOptions: [{ id: 'ble', label: () => 'BLE' }] });
    expect(options('#inp-opp')).toEqual(['human', 'easy', 'normal', 'strong']);
    expect(q<HTMLSelectElement>('#inp-opp').value).toBe('easy');
  });

  it('действие платформы на карточке и внешние ссылки через надстройку', () => {
    const onSelect = vi.fn();
    const openExternal = vi.fn();
    mountApp({
      prefs: { howtoShown: true },
      supportUrl: 'https://example.org/support',
      openExternal,
      extraActions: [
        { id: 'tip', label: () => 'Чаевые', startCard: true, onSelect },
        { id: 'quiet', label: () => 'Тихое', onSelect: vi.fn() },
      ],
    });
    const row = [...overlay().querySelectorAll('.action-row button')];
    expect(row.map((b) => b.textContent)).toEqual(['Чаевые']);
    click(row[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const link = q<HTMLAnchorElement>('.links-line a[target="_blank"]');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9 });
    link.dispatchEvent(ev);
    expect(openExternal).toHaveBeenCalledWith('https://example.org/support');
    expect(ev.defaultPrevented).toBe(true);
    // Неизвестное действие и клик мимо всего — без последствий.
    overlay().insertAdjacentHTML(
      'beforeend',
      '<button data-action="x-act:none"></button><button data-action="unknown"></button><button data-action="next-round"></button>',
    );
    click(q('[data-action="x-act:none"]'));
    click(q('[data-action="unknown"]'));
    // Кнопка следующего раунда без матча — мимо.
    click(q('[data-action="next-round"]'));
    click(document.body);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('без обработчика внешних ссылок клик по ссылке остаётся браузеру', () => {
    mountApp({ prefs: { howtoShown: true }, supportUrl: 'https://example.org/support' });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9 });
    q('.links-line a[target="_blank"]').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('каркас: сохранённый матч', () => {
  const saved = matchOf(roundOf({ hands: [['6-5'], ['4-3']], boneyard: ['1-0'], seed: 5 }), {
    names: ['<Аня>', 'Боря'],
    totals: [3, 9],
  });

  it('кнопка продолжения с именами и счётом; продолжение без звука раздачи и по настройке автомасштаба', () => {
    const m = mountApp({ prefs: { howtoShown: true, autoFit: false }, saved });
    expect(q('[data-action="continue"]').textContent).toBe('Продолжить <Аня> 3:9 Боря');
    expect(m.board.autoFit).toBe(false);
    click(q('[data-action="continue"]'));
    expect(m.app.getMatch()).toEqual(saved);
    expect(sound.playShuffle).not.toHaveBeenCalled();
    expect(m.board.autoFit).toBe(false);
    expect(overlay().hidden).toBe(true);
    expect(toastText()).toBe('');
    // Первый показанный ход после продолжения не замеряется.
    vi.advanceTimersByTime(500);
    click(q('.hand-tile[data-tile="6-5"]'));
    click(q('#board [data-move]'));
    expect(m.app.getMatch()!.round.history[0]).toEqual({ type: 'place', tile: '6-5' });
  });

  it('сейв исчез между показом карточки и кликом — ничего не происходит', () => {
    const m = mountApp({ prefs: { howtoShown: true }, saved });
    m.storage.mem.delete(KEYS.match);
    click(q('[data-action="continue"]'));
    expect(m.app.getMatch()).toBeNull();
  });

  it('оконченный матч и негодный сейв продолжить нельзя; негодный стирается', () => {
    mountApp({ prefs: { howtoShown: true }, saved: { ...saved, outcome: { kind: 'draw' } } });
    expect(has('[data-action="continue"]')).toBe(false);
    unmountApps();
    const storage = makeStorage({ [KEYS.ui]: '{}', [KEYS.match]: '{"v":2,"match":{"names":"x"}}' });
    mountApp({ storage });
    expect(has('[data-action="continue"]')).toBe(false);
    expect(storage.mem.has(KEYS.match)).toBe(false);
  });

  it('сейв, на котором первый рендер падает, стирается, карточка показывается', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Проверку проходит, но счёта в нём нет — рендер кнопки продолжения падает.
    const broken = { names: ['А', 'Б'], round: { hands: [[], []] } };
    const storage = makeStorage({ [KEYS.ui]: '{}', [KEYS.match]: JSON.stringify({ v: 2, match: broken }) });
    mountApp({ storage });
    expect(err).toHaveBeenCalledTimes(1);
    expect(storage.mem.has(KEYS.match)).toBe(false);
    expect(overlay().hidden).toBe(false);
    expect(has('[data-action="continue"]')).toBe(false);
    unmountApps();
    // Хранилище не даёт стереть сейв: кэш разбора и после сбоя отдаёт тот же сейв —
    // второй рендер падает так же, ошибка всплывает наружу.
    const stuck = makeStorage({ [KEYS.ui]: '{}', [KEYS.match]: JSON.stringify({ v: 2, match: broken }) });
    stuck.remove = () => {
      throw new Error('нет доступа');
    };
    expect(() => mountApp({ storage: stuck })).toThrow();
  });
});

describe('каркас: настройки', () => {
  it('экран настроек: строки каркаса, игры и платформы; закрытие', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const m = mountApp({
      prefs: { howtoShown: true },
      privacyUrl: 'https://example.org/privacy',
      extraToggles: [{ id: 'awake', label: () => 'Не гасить <экран>', initial: false, onChange }],
      extraActions: [{ id: 'tip', label: () => 'Чаевые', onSelect }],
    });
    expect(q('#settings').hidden).toBe(true);
    click(q('[data-action="settings-open"]'));
    const settings = q('#settings');
    expect(settings.hidden).toBe(false);
    const ids = [...settings.querySelectorAll<HTMLInputElement>('input[data-set]')].map((i) => i.dataset.set);
    expect(ids).toEqual(['sound', 'tutor', 'confirm', 'wide', 'x:awake']);
    expect(settings.querySelector('.privacy-line a')!.getAttribute('href')).toBe('https://example.org/privacy');
    expect(settings.textContent).toContain('Не гасить <экран>');

    // Переключатель платформы: состояние сохраняется, надстройка извещена.
    onChange.mockClear();
    setChecked(q<HTMLInputElement>('#settings input[data-set="x:awake"]'), true);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(readPrefs(m.storage).toggles).toEqual({ awake: true });

    // Настройка игры.
    setChecked(q<HTMLInputElement>('#settings input[data-set="wide"]'), true);
    expect(m.spy.prefs.wide).toBe(true);
    expect(readPrefs(m.storage).game).toEqual({ wide: true, hand: 3 });

    // Звук: включение даёт пробный стук.
    setChecked(q<HTMLInputElement>('#settings input[data-set="sound"]'), false);
    expect(sound.setSoundEnabled).toHaveBeenLastCalledWith(false);
    expect(sound.playPlace).not.toHaveBeenCalled();
    setChecked(q<HTMLInputElement>('#settings input[data-set="sound"]'), true);
    expect(sound.playPlace).toHaveBeenCalledWith('normal');
    expect(readPrefs(m.storage).sound).toBe(true);

    setChecked(q<HTMLInputElement>('#settings input[data-set="tutor"]'), false);
    setChecked(q<HTMLInputElement>('#settings input[data-set="confirm"]'), true);
    expect(readPrefs(m.storage)).toMatchObject({ tutor: false, confirm: true });
    expect(overlay().querySelector('.tutor-hint')).toBeNull();

    // Действие платформы из настроек: экран закрывается, надстройка зовётся один раз.
    click(q('#settings [data-action="x-act:tip"]'));
    expect(settings.hidden).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Шестерёнка в шапке открывает и закрывает; «Готово» закрывает.
    click(q('#btn-settings'));
    expect(settings.hidden).toBe(false);
    click(q('#btn-settings'));
    expect(settings.hidden).toBe(true);
    click(q('#btn-settings'));
    click(q('#settings [data-action="settings-close"]'));
    expect(settings.hidden).toBe(true);
  });

  it('язык в настройках: всё перерисовывается на новом языке', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    click(q('#btn-settings'));
    setValue('#set-lang', 'en');
    expect(readPrefs(m.storage).locale).toBe('en');
    expect(q('#settings h1').textContent).toBe('Настройки [en]');
    expect(overlay().querySelector('.sub')!.textContent).toBe('Слоган [en]');
  });

  it('чужие события в настройках и неизвестные идентификаторы игнорируются', () => {
    const onChange = vi.fn();
    const m = mountApp({
      prefs: { howtoShown: true },
      view: { bare: true },
      extraToggles: [{ id: 'awake', label: () => 'Экран', initial: false, onChange }],
    });
    click(q('#btn-settings'));
    const settings = q('#settings');
    const ids = [...settings.querySelectorAll<HTMLInputElement>('input[data-set]')].map((i) => i.dataset.set);
    expect(ids).toEqual(['sound', 'tutor', 'confirm', 'x:awake']);
    expect(settings.querySelector('.privacy-line')).toBeNull();
    onChange.mockClear();
    const raw = m.storage.mem.get(KEYS.ui);
    // Поле без data-set, неизвестный переключатель платформы, неизвестное действие, клик мимо.
    settings.insertAdjacentHTML(
      'beforeend',
      '<input id="stray" type="checkbox"><input data-set="x:none" type="checkbox"><input data-set="game-only" type="checkbox">' +
        '<a href="#" data-action="x-act:none">нет</a><span id="plain">текст</span><i data-action="">пусто</i>',
    );
    setChecked(q<HTMLInputElement>('#stray'), true);
    setChecked(q<HTMLInputElement>('#settings input[data-set="x:none"]'), true);
    expect(onChange).not.toHaveBeenCalled();
    expect(m.storage.mem.get(KEYS.ui)).toBe(raw);
    click(q('#settings [data-action="x-act:none"]'));
    click(q('#plain'));
    click(q('#settings i'));
    expect(settings.hidden).toBe(false);
    // Строка игры у игры без настроек: сохраняется как есть, игра её не слышит.
    setChecked(q<HTMLInputElement>('#settings input[data-set="game-only"]'), true);
    expect(m.storage.mem.get(KEYS.ui)).not.toBe(raw);
  });

  it('кнопка автомасштаба и жест над столом меняют настройку', () => {
    const m = mountApp({ prefs: { howtoShown: true } });
    expect(q('#btn-fit').classList.contains('active')).toBe(true);
    click(q('#btn-fit'));
    expect(m.board.autoFit).toBe(false);
    expect(q('#btn-fit').classList.contains('active')).toBe(false);
    expect(readPrefs(m.storage).autoFit).toBe(false);
    m.board.hooks!.onViewChange(true);
    expect(q('#btn-fit').classList.contains('active')).toBe(true);
    expect(readPrefs(m.storage).autoFit).toBe(true);
  });
});
