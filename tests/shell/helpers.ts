// Помощники jsdom-тестов каркаса: страница с нужной разметкой, хранилище на
// Map, тексты и языки игрушечной игры, монтирование со снятием слушателей.
// Не тест: прагма `@vitest-environment jsdom` стоит в тестах.
import { vi } from 'vitest';
import { initShell } from '../../src/shell/shell';
import type { AppHandle, AppOptions, ShellTexts } from '../../src/shell/types';
import type { KVStore } from '../../src/store';
import {
  BASE,
  lineEngine,
  makeBoard,
  makeView,
  type LineMatch,
  type LineMove,
  type LineOutcome,
  type LineResult,
  type LineState,
  type LineVariant,
  type ToyBoard,
  type ViewConfig,
  type ViewSpy,
} from './toy-game';

export const KEYS = { match: 'line-match-v1', ui: 'line-ui-v1' } as const;

export type Handle = AppHandle<LineState, LineMove, LineVariant, LineResult, LineOutcome>;
export type Options = AppOptions<LineState, LineMove, LineVariant, LineResult, LineOutcome>;

const PAGE = `
  <div id="app">
    <header id="topbar">
      <div class="brand"><span class="brand-name">Линия</span><span id="round-chip"></span></div>
      <div id="status-event"></div><div id="status-prompt"></div>
      <button id="btn-hist"></button><button id="btn-fit"></button>
      <button id="btn-settings"></button><button id="btn-new"></button>
    </header>
    <section id="hand-top" class="hand"></section>
    <main id="table">
      <svg id="board"></svg>
      <div id="boneyard"></div>
      <div id="tutor-bar" hidden></div>
      <div id="confirm-bar" hidden></div>
      <div id="history-bar" hidden></div>
      <div id="toast" hidden></div>
    </main>
    <section id="hand-bottom" class="hand"></section>
    <div id="overlay" hidden></div>
  </div>`;

let locale = 'ru';
/** Язык игрушечной игры: en помечает тексты суффиксом — смена языка видна в DOM. */
const mark = (s: string): string => (locale === 'en' ? `${s} [en]` : s);

export const i18n = {
  getLocale: () => locale,
  setLocale: (code: string) => void (locale = code),
  detectLocale: (saved: string | null) => (saved === 'en' || saved === 'ru' ? saved : 'ru'),
  locales: [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
  ],
};

export function texts(): ShellTexts {
  return {
    tagline: mark('Слоган'),
    howtoLink: mark('Как играть'),
    linkSupport: mark('Поддержать'),
    linkAppStore: mark('App Store'),
    linkGooglePlay: mark('Google Play'),
    linkPrivacy: mark('Конфиденциальность'),
    fieldName: mark('Имя игрока'),
    fieldYourName: mark('Ваше имя'),
    fieldOpponentName: mark('Имя соперника'),
    fieldOpponent: mark('Соперник'),
    fieldLang: mark('Язык'),
    oppHuman: mark('человек'),
    oppBotEasy: mark('бот лёгкий'),
    oppBotNormal: mark('бот обычный'),
    oppBotStrong: mark('бот сильный'),
    botNameEasy: mark('Лёгкий бот'),
    botNameNormal: mark('Обычный бот'),
    botNameStrong: mark('Сильный бот'),
    defaultP1: mark('Игрок 1'),
    defaultP2: mark('Игрок 2'),
    lotDecides: mark('Жребий решает'),
    lotWinner: (name) => `${mark('Первым ходит')} ${name}`,
    btnLot: mark('Жребий'),
    btnStart: mark('Начать'),
    btnContinue: (label) => `${mark('Продолжить')} ${label}`,
    tutorStart: mark('Бросьте жребий'),
    versionWord: mark('версия'),
    rulesWord: (v) => `${mark('правила')} ${v}`,
    roundChip: (n) => `${mark('раунд')} ${n}`,
    viewChip: (i, n) => `${mark('просмотр')} ${i}/${n}`,
    statusNewRound: mark('Новый раунд'),
    statusRoundOver: mark('Раунд окончен'),
    statusBotThinking: (name) => `${name}: ${mark('думает')}`,
    tipHistory: mark('История'),
    tipFit: mark('Автомасштаб'),
    tipNew: mark('Бросить матч'),
    confirmNewMatch: mark('Бросить матч?'),
    firstChip: mark('первый'),
    turnMarkTitle: mark('Ходит'),
    pileCount: (n) => `${mark('базар')}: ${n}`,
    toastNoDrawHaveMove: mark('Есть ход'),
    toastNoDrawNow: mark('Сейчас тянуть нельзя'),
    toastPassAuto: (name) => `${name}: ${mark('пас')}`,
    toastFirstOpen: (name) => `${mark('Первым ходит')} ${name}`,
    toastRoundStart: (n, name) => `${mark('Раунд')} ${n}: ${name}`,
    toastProtoBroken: (err) => `${mark('Протокол сломан')}: ${err}`,
    tutorBotTurn: mark('Ходит бот'),
    tutorRemoteTurn: mark('Ходит соперник'),
    tutorPending: mark('Подтвердите ход'),
    tutorShowRules: mark('показывать подсказки'),
    tutorEnough: mark('Подсказки больше не нужны?'),
    btnTutorOff: mark('Выключить'),
    btnTutorKeep: mark('Оставить'),
    confirmYes: mark('Поставить'),
    confirmNo: mark('Отмена'),
    resultTime: (round, total) => `${mark('время')} ${round} / ${total}`,
    btnNextRound: mark('Следующий раунд'),
    btnWaiting: mark('Ждём соперника'),
    btnPeerReady: mark('Соперник готов'),
    btnAbortMatch: mark('Бросить матч'),
    btnNewMatch: mark('Новый матч'),
    btnHistory: mark('История ходов'),
    historyLive: mark('История матча'),
    historyDeal: (name) => `${mark('Раздача')}: ${name}`,
    historyPos: (k, m) => `${k}/${m}`,
    roundOptLive: (n) => `${mark('Раунд')} ${n} — ${mark('идёт')}`,
    tipExitReplay: mark('К игре'),
    tipRoundSelect: mark('Раунд'),
    tipToDeal: mark('К раздаче'),
    tipStepBack: mark('Назад'),
    tipStepFwd: mark('Вперёд'),
    tipToEnd: mark('К концу'),
    settingsTitle: mark('Настройки'),
    btnDone: mark('Готово'),
    tipSound: mark('Звук'),
    tipTutor: mark('Обучение'),
    tipConfirm: mark('Подтверждение хода'),
  };
}

export interface MemStore extends KVStore {
  readonly mem: Map<string, string>;
}

export function makeStorage(initial: Record<string, string> = {}): MemStore {
  const mem = new Map(Object.entries(initial));
  return {
    mem,
    get: (k) => mem.get(k) ?? null,
    set: (k, v) => void mem.set(k, v),
    remove: (k) => void mem.delete(k),
  };
}

export function readPrefs(storage: MemStore): Record<string, unknown> {
  return JSON.parse(storage.mem.get(KEYS.ui) ?? '{}') as Record<string, unknown>;
}

/** Прокрутка элементов (в jsdom её нет): общий шпион — рука подъезжает к играбельной кости. */
export const scrollToStub = vi.fn();

/** Заглушки того, чего в jsdom нет. */
function installDomStubs(): void {
  Element.prototype.scrollTo = scrollToStub as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.setPointerCapture = () => undefined;
}

type Listener = readonly [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const mounted: Listener[][] = [];

export interface MountOptions extends Omit<Options, 'storage'> {
  /** Начальные настройки интерфейса (пишутся в хранилище до старта). */
  readonly prefs?: Record<string, unknown>;
  /** Сохранённый матч (кладётся в конверт версии 2). */
  readonly saved?: LineMatch;
  readonly storage?: KVStore;
  /** Не передавать хранилище вовсе — каркас возьмёт localStorage. */
  readonly noStorage?: boolean;
  readonly view?: ViewConfig;
  readonly engine?: typeof lineEngine;
  /** Своя разметка страницы вместо стандартной. */
  readonly page?: string;
}

export interface Mounted {
  readonly app: Handle;
  readonly storage: MemStore;
  readonly spy: ViewSpy;
  readonly board: ToyBoard;
}

/**
 * Смонтировать каркас с игрушечной игрой в чистый DOM. Слушатели, добавленные
 * на document и window за время старта, запоминаются — см. unmountApps.
 */
export function mountApp(opts: MountOptions = {}): Mounted {
  installDomStubs();
  locale = 'ru';
  document.body.innerHTML = opts.page ?? PAGE;
  const { prefs, saved, storage: given, noStorage, view: viewCfg, engine, page: _page, ...appOpts } = opts;
  const storage = (given ?? makeStorage()) as MemStore;
  if (prefs) storage.set(KEYS.ui, JSON.stringify(prefs));
  if (saved) storage.set(KEYS.match, JSON.stringify({ v: 2, match: saved }));
  const { view, spy } = makeView(viewCfg);
  const board = makeBoard();

  const added: Listener[] = [];
  const patch = (target: EventTarget): (() => void) => {
    const orig = target.addEventListener;
    target.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, o?: unknown) {
      if (fn) added.push([target, type, fn, o]);
      return orig.call(this, type, fn, o as AddEventListenerOptions | undefined);
    } as typeof target.addEventListener;
    return () => {
      target.addEventListener = orig;
    };
  };
  const restore = [patch(document), patch(window)];
  try {
    const app = initShell({
      ...appOpts,
      ...(noStorage ? {} : { storage }),
      game: { engine: engine ?? lineEngine, view, board: board.factory },
      keys: KEYS,
      i18n,
      texts,
      build: { version: '1.2.3', hash: 'abc1234' },
    });
    mounted.push(added);
    return { app, storage, spy, board };
  } finally {
    for (const r of restore) r();
  }
}

/** Снять слушателей всех смонтированных каркасов и погасить их таймеры. */
export function unmountApps(): void {
  for (const list of mounted.splice(0)) {
    for (const [target, type, fn, o] of list) {
      target.removeEventListener(type, fn, o as EventListenerOptions | undefined);
    }
  }
  if (vi.isFakeTimers()) vi.clearAllTimers();
}

/** Матч с внешним игроком за вторым местом: общий seed, первым ходит место 0. */
export function startFixture(
  app: Handle,
  over: Partial<{ variant: LineVariant; seed: number; remoteSeat: 0 | 1; first: 0 | 1 }> = {},
): void {
  app.startRemoteMatch({ names: ['А', 'Б'], first: 0, variant: BASE, seed: 7, remoteSeat: 1, ...over });
}

/** Доиграть текущий раунд первым легальным ходом (внешними ходами). */
export function playRoundToEnd(app: Handle): void {
  for (let i = 0; i < 200; i++) {
    const m = app.getMatch();
    if (!m || m.round.phase === 'over') break;
    app.dispatch(lineEngine.legalMoves(m.round)[0]!);
  }
  if (app.getMatch()?.round.phase !== 'over') throw new Error('Раунд не завершился');
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
}

/** Ходить первым легальным ходом, пока позиция не удовлетворит условию. */
export function playUntil(app: Handle, pred: (s: LineState, moves: readonly LineMove[]) => boolean): boolean {
  for (let i = 0; i < 200; i++) {
    const m = app.getMatch();
    if (!m || m.round.phase === 'over') return false;
    const moves = lineEngine.legalMoves(m.round);
    if (pred(m.round, moves)) return true;
    app.dispatch(moves[0]!);
  }
  return false;
}

/**
 * Клик с координатами вне экрана: клик мимо контролов в границах кучи базара
 * каркас считает добором, а в jsdom все прямоугольники нулевые — клик в (0, 0)
 * попадал бы «в кучу».
 */
export function click(el: Element | null | undefined, init: MouseEventInit = {}): void {
  if (!el) throw new Error('click: элемента нет');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: -9, clientY: -9, ...init }));
}

export function q<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
}

export const has = (sel: string): boolean => document.querySelector(sel) !== null;

/** Событие change или input на поле с новым значением. */
export function setValue(sel: string, value: string, type: 'change' | 'input' = 'change'): void {
  const el = q<HTMLInputElement | HTMLSelectElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Галочка: поставить состояние и сообщить change. */
export function setChecked(el: HTMLInputElement, on: boolean): void {
  el.checked = on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Поддельные часы целиком: таймеры, Date, performance.now и кадры анимации. */
export function useFakeClock(): void {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
}

export function toastText(): string {
  const t = q('#toast');
  return t.hidden ? '' : (t.textContent ?? '');
}

export const rectOf = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** Состояние раунда игрушечной игры с заданными полями — позиция под тест. */
export function roundOf(p: Partial<LineState> = {}): LineState {
  return {
    phase: 'play',
    current: 0,
    first: 0,
    seed: 1,
    history: [],
    result: null,
    log: [],
    hands: [[], []],
    boneyard: [],
    placed: [],
    end: null,
    forced: null,
    passStreak: 0,
    variant: BASE,
    ...p,
  };
}

export function matchOf(round: LineState, over: Partial<LineMatch> = {}): LineMatch {
  return {
    names: ['А', 'Б'],
    totals: [0, 0],
    rounds: [],
    variant: round.variant,
    first: round.first,
    round,
    outcome: null,
    bot: null,
    ...over,
  };
}

/**
 * Смонтировать каркас и продолжить заданный матч со стартовой карточки: оба
 * места — за этим экраном. settle — выждать 400 мс: каркас гасит клики по
 * теням и куче в первые 300 мс после хода (и после старта часов с нуля).
 */
export function resume(match: LineMatch, opts: MountOptions = {}, settle = true): Mounted {
  const m = mountApp({ prefs: { howtoShown: true }, ...opts, saved: match });
  click(q('[data-action="continue"]'));
  if (settle && vi.isFakeTimers()) vi.advanceTimersByTime(400);
  return m;
}
