// Контракты каркаса приложения домино-игры на двоих. Каркас (shell.ts) ведёт
// экраны, руки, базар, историю, настройки и оркестровку ходов; игру он знает
// только через три вещи: движок (GameEngine), стол (BoardRenderer) и игровые
// виды и тексты (GameView). Здесь одни типы.

import type { BotSeat, GameEngine, MoveCore, RoundCore, RoundResultCore, Seat } from '../engine';
import type { MatchState } from '../match';
import type { PlaceSound } from '../sound';
import type { KVStore } from '../store';
import type { TileBackOptions } from '../tile-svg';
import type { TileId } from '../tiles';

// --- Стол ---------------------------------------------------------------------

/** Кость на экране: центр в px окна, угол в градусах, длина кости в px. */
export interface ScreenPose {
  x: number;
  y: number;
  angle: number;
  scale: number;
}

/** Тень хода на экране — цель для перетягивания кости из руки. */
export interface GhostTarget<M> {
  readonly move: M;
  /** Точка прилипания. */
  readonly x: number;
  readonly y: number;
  /** Как кость ляжет на эту тень. */
  readonly pose: ScreenPose;
  /** Значения половин в порядке клеток тени (как у выложенной кости). */
  readonly values: readonly [number, number];
}

export interface BoardHooks<M> {
  /** Клик по тени хода. */
  onMove(move: M): void;
  /** Автомасштаб переключился: false — пользователь подвигал или зумил стол сам. */
  onViewChange(auto: boolean): void;
}

export interface BoardRenderOptions<M> {
  /** Тени ходов выбранной кости. */
  readonly ghostMoves: readonly M[];
  readonly selected: TileId | null;
  /** Анимировать кость с этим номером (только что выложенную). */
  readonly animateSeq: number | null;
  /** Принимать ли клики по теням. */
  readonly interactive: boolean;
  /** Ход, ожидающий подтверждения: его тень подсвечивается. */
  readonly pending?: M | null;
  /** Кость с этим номером скрыта: к месту летит её клон. */
  readonly hideSeq?: number | null;
  /** Игровые переключатели вида стола. */
  readonly game?: Readonly<Record<string, boolean>>;
}

export interface BoardRenderer<S, M> {
  render(state: S, opts: BoardRenderOptions<M>): void;
  /** Выложенная кость на экране (для летящего клона); null, пока стол не свёрстан. */
  placedScreenPoint(seq: number): ScreenPose | null;
  /** Тени последнего рендера на экране. */
  ghostTargets(): GhostTarget<M>[];
  /** Довести кость в кадр минимальным сдвигом. */
  ensureVisible(seq: number, margin?: number): void;
  setAutoFit(on: boolean, animate?: boolean): void;
  isAutoFit(): boolean;
}

export type BoardFactory<S, M> = (svg: SVGSVGElement, hooks: BoardHooks<M>) => BoardRenderer<S, M>;

// --- Тексты каркаса --------------------------------------------------------------

/**
 * Тексты каркаса на текущем языке. Переводы хранит игра: её словарь обязан
 * содержать эти ключи. Параметры-имена приходят уже экранированными там, где
 * результат вставляется как HTML (lotWinner, historyDeal, statusWaiting).
 */
export interface ShellTexts {
  // Стартовая карточка
  readonly tagline: string;
  readonly howtoLink: string;
  readonly linkSupport: string;
  readonly linkAppStore: string;
  readonly linkGooglePlay: string;
  readonly linkPrivacy: string;
  readonly fieldName: string;
  readonly fieldYourName: string;
  readonly fieldOpponentName: string;
  readonly fieldOpponent: string;
  readonly fieldLang: string;
  readonly oppHuman: string;
  readonly oppBotEasy: string;
  readonly oppBotNormal: string;
  readonly oppBotStrong: string;
  readonly botNameEasy: string;
  readonly botNameNormal: string;
  readonly botNameStrong: string;
  readonly defaultP1: string;
  readonly defaultP2: string;
  readonly lotDecides: string;
  lotWinner(nameHtml: string): string;
  readonly btnLot: string;
  readonly btnStart: string;
  btnContinue(label: string): string;
  readonly tutorStart: string;
  readonly versionWord: string;
  rulesWord(version: string): string;
  // Шапка и статус
  roundChip(n: number): string;
  viewChip(i: number, n: number): string;
  readonly statusNewRound: string;
  readonly statusRoundOver: string;
  /** Ждём хода не за этим экраном — бота или соперника: текст нейтральный. */
  statusBotThinking(nameHtml: string): string;
  readonly tipHistory: string;
  readonly tipFit: string;
  readonly tipNew: string;
  readonly confirmNewMatch: string;
  // Руки и базар
  readonly firstChip: string;
  readonly turnMarkTitle: string;
  pileCount(n: number): string;
  // Тосты
  readonly toastNoDrawHaveMove: string;
  readonly toastNoDrawNow: string;
  toastPassAuto(name: string): string;
  toastFirstOpen(name: string): string;
  toastRoundStart(n: number, name: string): string;
  toastProtoBroken(err: string): string;
  // Обучение и подтверждение хода
  readonly tutorBotTurn: string;
  readonly tutorRemoteTurn: string;
  readonly tutorPending: string;
  readonly tutorShowRules: string;
  readonly tutorEnough: string;
  readonly btnTutorOff: string;
  readonly btnTutorKeep: string;
  readonly confirmYes: string;
  readonly confirmNo: string;
  // Итоги
  resultTime(round: string, total: string): string;
  readonly btnNextRound: string;
  readonly btnWaiting: string;
  readonly btnPeerReady: string;
  readonly btnAbortMatch: string;
  readonly btnNewMatch: string;
  readonly btnHistory: string;
  // История
  readonly historyLive: string;
  historyDeal(nameHtml: string): string;
  historyPos(k: number, m: number): string;
  roundOptLive(n: number): string;
  readonly tipExitReplay: string;
  readonly tipRoundSelect: string;
  readonly tipToDeal: string;
  readonly tipStepBack: string;
  readonly tipStepFwd: string;
  readonly tipToEnd: string;
  // Настройки
  readonly settingsTitle: string;
  readonly btnDone: string;
  readonly tipSound: string;
  readonly tipTutor: string;
  readonly tipConfirm: string;
}

/** Язык интерфейса: механика пакета i18n, словари — у игры. */
export interface ShellI18n {
  getLocale(): string;
  setLocale(code: string): void;
  detectLocale(saved: string | null): string;
  readonly locales: ReadonlyArray<{ readonly code: string; readonly label: string }>;
}

// --- Игра -----------------------------------------------------------------------

/** Вид хода для каркаса: звук, полёт кости, добор, автопас. */
export type MoveKind = 'place' | 'draw' | 'pass';

/** Свой ход за этим экраном: что видит подсказка и приглашение. */
export interface TurnCtx<M> {
  readonly legal: readonly M[];
  readonly selected: TileId | null;
  /** Имя ходящего для вставки в HTML: экранировано и выделено. */
  readonly nameHtml: string;
}

/** Содержимое карточки итогов раунда; рамку, кнопки и время рисует каркас. Всё — HTML. */
export interface RoundOverView {
  readonly title: string;
  readonly sub: string;
  /** Строки таблицы итогов: имена, руки, очки. */
  readonly rows: string;
  /** Подпись «раунд N» с целью матча. */
  readonly matchLabel: string;
  /** Заголовок исхода матча; null — матч продолжается. */
  readonly outcomeTitle: string | null;
  /** Кто начинает следующий раунд и почему (когда матч продолжается). */
  readonly nextNote: string;
}

/** Строка-переключатель игры на экране настроек. */
export interface GameSetting {
  /** Не 'sound' / 'tutor' / 'confirm' и не начинается с «x:» — это строки каркаса и платформы. */
  readonly id: string;
  readonly on: boolean;
  readonly text: string;
}

/** Что каркас даёт игре для её собственных кнопок и настроек. */
export interface ShellApi<S, M, V, R, O> {
  readonly board: BoardRenderer<S, M>;
  getMatch(): MatchState<S, M, V, R, O> | null;
  /** Подменить состояние текущего раунда (смена раскладки без хода): сохранить и перерисовать. */
  setRound(round: S): void;
  /** Идёт просмотр истории. */
  isReplay(): boolean;
  /** Место, управляемое извне (сетевая партия); null — нет. */
  remoteSeat(): Seat | null;
  render(): void;
  /** Сохранить настройки интерфейса (вместе с игровыми). */
  persistUi(): void;
  toast(text: string, warn?: boolean): void;
}

/**
 * Игровые виды и тексты: всё, что каркасу нужно знать о позиции, но что
 * читается из состояния игры. S — состояние раунда, M — ход, V — вариант
 * правил, R — итог раунда, L — запись журнала, O — исход матча.
 */
export interface GameView<S, M, V, R, L, O> {
  // Лицо игры
  /** Логотип игры (SVG). */
  logo(size: number, className: string): string;
  /** Содержимое заголовка стартовой карточки: логотип и имя игры. */
  titleHtml(): string;
  /** Адрес полного текста правил на текущем языке. */
  rulesUrl(): string;
  /** Рубашка кости с эмблемой игры (SVG-группа). */
  tileBack(opts: TileBackOptions): string;
  openHowTo(o: { onClose?: () => void }): void;
  openHowToAsk(o: { onShow: () => void; onLater: () => void }): void;
  /** Есть ли игра вдвоём за одним экраном (при скрытых руках — нет). */
  readonly hotSeat: boolean;
  /** Сколько костей в базаре сразу после раздачи. */
  readonly pileSize: number;

  // Ходы
  moveKind(m: M): MoveKind;
  /** Кость руки, которая уходит этим ходом; null — ход без кости руки. */
  moveTile(m: M, s: S): TileId | null;
  /** Номер кости, которая легла на стол этим ходом; null — ничего не легло. */
  placedSeqOf(m: M, after: S): number | null;
  /** Значения половин выложенной кости в порядке её клеток. */
  placedValues(s: S, seq: number): readonly [number, number];
  /** Каким стуком звучит выкладывание. */
  placeSound(m: M, after: S): PlaceSound;
  /** Совпадение хода с черновиком — включая выбор раскладки, безразличный правилам. */
  samePlacement(a: M, b: M): boolean;
  /** Тени ходов выбранной кости (раскладочные варианты одного хода — отдельными тенями). */
  ghostMoves(s: S, legal: readonly M[], selected: TileId): M[];
  /** Кость, которой текущий игрок обязан сходить; null — выбор свободен. */
  forcedTile(s: S): TileId | null;
  /** Тост в ответ на попытку взять другую кость при обязательной. */
  forcedToast(s: S): string;
  /** Кость, вытянутая последним ходом; null — последний ход не был добором. */
  drawnTile(s: S): TileId | null;
  /** Выбор кости возвращает автомасштаб (место хода должно быть в кадре). */
  refitOnPick?(s: S): boolean;

  // Тексты позиции
  /** Чей это ход по записи журнала; null — запись без игрока. */
  logSeat(e: L): Seat | null;
  /** Строка журнала. viewer — кто смотрит: место за этим экраном или 'all' (история, итоги). */
  describeLog(e: L, names: readonly [string, string], viewer: Seat | 'all'): string;
  /** Приглашение к ходу (HTML) — в свой ход за этим экраном. */
  prompt(s: S, ctx: TurnCtx<M>): string;
  /** Подсказка обучения в свой ход. */
  tutor(s: S, ctx: TurnCtx<M>): string;
  /** Подсказка обучения после конца раунда. */
  tutorOver(s: S): string;
  /** Вопрос подтверждения хода. */
  confirmQuestion(m: M, s: S): string;

  // Руки и итоги
  /** Рука закрыта для смотрящего за этим экраном (bottom — чьё место внизу). */
  handHidden(s: S, seat: Seat, bottom: Seat): boolean;
  /** Подпись под именем: число костей, очки. */
  handMeta(s: S, seat: Seat, hidden: boolean): string;
  /** Бейдж счёта матча у имени (HTML). */
  totalChip(match: MatchState<S, M, V, R, O>, seat: Seat): string;
  roundOver(match: MatchState<S, M, V, R, O>, nameOf: (seat: Seat) => string): RoundOverView;
  /** Подпись завершённого раунда в списке истории; index — с 0. */
  roundSummary(result: R, index: number): string;

  // Стартовая карточка и сохранения
  /** Игровые поля стартовой карточки (HTML): вариант правил, цель матча. */
  startFields(): string;
  /** Изменилось поле стартовой карточки; true — поле игровое, настройки надо сохранить. */
  startFieldChange?(el: HTMLInputElement | HTMLSelectElement): boolean;
  /** Галочки стартовой карточки, которые не хранятся и должны пережить её перерисовку (селекторы). */
  readonly keepFields?: readonly string[];
  /** Вариант правил по состоянию стартовой карточки. */
  variantFrom(card: ParentNode): V;
  /** Проверка сейва из сырого JSON; null — сейв негоден. */
  validateSaved(raw: unknown): MatchState<S, M, V, R, O> | null;

  // Игровые настройки вида
  /**
   * Где лежат игровые настройки в сохранённых настройках интерфейса:
   * true — в корне, вперемешку с общими (исторический формат), иначе — в поле game.
   */
  readonly prefsFlat?: boolean;
  /** Принять сохранённые игровые настройки (сырой JSON). */
  loadPrefs(raw: Readonly<Record<string, unknown>>): void;
  /** Игровые настройки для сохранения. */
  dumpPrefs(): Record<string, unknown>;
  /** Переключатели вида стола — уходят в BoardRenderOptions.game. bottom — чьё место внизу экрана. */
  boardFlags?(bottom: Seat): Readonly<Record<string, boolean>>;
  /** Игровые строки экрана настроек. */
  settings?(): GameSetting[];
  setSetting?(id: string, on: boolean): void;
  /** Один раз при старте: игра вешает свои кнопки шапки и получает доступ к каркасу. */
  mount?(api: ShellApi<S, M, V, R, O>): void;
  /** Перед отрисовкой: round — живой раунд на столе или null (история, стартовая карточка). */
  onRender?(live: { readonly round: S; readonly remote: boolean } | null): void;
  /** Смена языка: игра обновляет подписи своих кнопок. */
  staticTexts?(): void;
}

// --- Приложение -------------------------------------------------------------------

/**
 * Дополнительный пункт селектора соперника (регистрирует платформенная
 * надстройка). id не должен совпадать с 'human' / 'easy' / 'normal' / 'strong'.
 */
export interface OpponentOption {
  id: string;
  /** Локализованная подпись пункта: надстройка переводит сама. */
  label: () => string;
  /** Нужен ли жребий. false — первого игрока определяет надстройка; блок жребия скрывается. */
  needsLots?: boolean;
  /** Нужно ли имя второго игрока. false — поле скрыто (имя придёт извне). */
  needsSecondName?: boolean;
  /** Подпись кнопки старта вместо стандартной. */
  startLabel?: () => string;
  /** Подпись поля имени вместо стандартной. */
  nameLabel?: () => string;
}

/**
 * Переключатель настройки, которую умеет только платформа (например, «не
 * гасить экран»). Каркас рисует его на экране настроек и хранит состояние
 * вместе с остальными настройками; что делать при переключении — знает
 * надстройка.
 */
export interface ExtraToggle {
  id: string;
  label: () => string;
  /** Значение при первом запуске, пока игрок ничего не выбрал. */
  initial: boolean;
  onChange(on: boolean): void;
}

/**
 * Пункт-действие платформы на экране настроек: строка-ссылка без состояния.
 * Настройки перед вызовом закрываются, чтобы экран надстройки лёг на чистый стол.
 */
export interface ExtraAction {
  id: string;
  label: () => string;
  /**
   * Продублировать пункт кнопкой во всю ширину внизу стартовой карточки и
   * на итогах раунда между раундами матча. Пункт в настройках остаётся.
   */
  startCard?: boolean;
  onSelect(): void;
}

/** Параметры старта матча, собранные стартовым экраном. */
export interface StartSetup<V> {
  names: [string, string];
  first: Seat;
  variant: V;
}

/**
 * Ожидание договора о следующем раунде в матче с внешним игроком:
 * waiting — наша кнопка уже нажата, ждём соперника; peerReady — соперник уже
 * нажал. Каркас только рисует состояние.
 */
export interface NextRoundWait {
  waiting: boolean;
  peerReady: boolean;
}

/** Что платформа (веб-вход, мобильная надстройка) настраивает в приложении. */
export interface AppOptions<S, M, V, R, O> {
  /** Хранилище вместо localStorage (например, нативные настройки). */
  storage?: KVStore;
  /** Открытие внешних ссылок (например, системным браузером вместо вкладки). */
  openExternal?: (url: string) => void;
  /** Адрес страницы «поддержать авторов» — ссылка на стартовой карточке. */
  supportUrl?: string;
  /** Адрес страницы приложения в App Store — ссылка на стартовой карточке. */
  appStoreUrl?: string;
  /** Адрес страницы приложения в Google Play — ссылка на стартовой карточке. */
  googlePlayUrl?: string;
  /** Адрес политики конфиденциальности — ссылка на экране настроек. */
  privacyUrl?: string;
  /**
   * Вызывается после каждого применённого хода — человека, бота и хода,
   * пришедшего через handle.dispatch. Транспорт удалённой игры обязан
   * фильтровать по месту хода, иначе получит эхо собственных ходов.
   */
  onMove?: (move: M, round: S) => void;
  /** Дополнительные пункты селектора соперника. */
  opponentOptions?: readonly OpponentOption[];
  /** Дополнительные переключатели настроек от платформы. */
  extraToggles?: readonly ExtraToggle[];
  /** Дополнительные пункты-действия платформы на экране настроек. */
  extraActions?: readonly ExtraAction[];
  /**
   * Старт матча с дополнительным пунктом селектора: стандартный старт не
   * выполняется, матч запускает надстройка (например, через своё лобби).
   */
  onOpponentStart?: (id: string, setup: StartSetup<V>) => void;
  /**
   * Клик «следующий раунд». Вернуть true — стандартный переход подавлен,
   * надстройка выполнит его сама (handle.nextRoundWith с общим seed).
   */
  onNextRoundRequest?: () => boolean;
  /** Пользователь сбросил матч: надстройке пора закрыть свои ресурсы. */
  onMatchReset?: () => void;
  /**
   * Матч завершён завершающим ходом раунда. Вызывается один раз на матч,
   * после onMove того же хода; при восстановлении уже завершённого матча из
   * хранилища не вызывается.
   */
  onMatchOver?: (match: MatchState<S, M, V, R, O>) => void;
}

/** Управление приложением снаружи: вход внешних ходов и чтение состояния. */
export interface AppHandle<S, M, V, R, O> {
  /**
   * Применить ход (например, пришедший от удалённого игрока). Тихо
   * игнорируется при завершённом раунде — вызывающий при необходимости
   * сверяется с getMatch().
   */
  dispatch(move: M): void;
  getMatch(): MatchState<S, M, V, R, O> | null;
  /**
   * Назначить место, управляемое извне: в его ход локальный ввод
   * заблокирован, ходы приходят через dispatch. null — снять.
   */
  setRemoteSeat(seat: Seat | null): void;
  /**
   * Пауза локального ввода: пока она стоит, за этим экраном не ходит ни одно
   * место (клики, перетаскивание, добор и автоматический пас выключены), ходы
   * применяются только через dispatch. Нужна, когда состояние матча ещё не
   * сверено с внешним игроком — например, сразу после перезапуска приложения:
   * локальный ход до сверки мог бы разойтись с тем, что соперник уже получил.
   * Снимается явно; каркас сбрасывает её сам при новом матче и сбросе матча.
   */
  setInputHold(hold: boolean): void;
  /**
   * Начать матч с внешним игроком: фиксированный общий seed, место соперника
   * управляется извне. Закрывает стартовый экран.
   */
  startRemoteMatch(o: { names: [string, string]; first: Seat; variant: V; seed: number; remoteSeat: Seat }): void;
  /** Следующий раунд с заданным seed (для синхронного перехода сторон). */
  nextRoundWith(seed: number): void;
  /**
   * Состояние договора о следующем раунде — кнопка на экране итогов. null —
   * обычный вид. Сбрасывается каркасом при переходе к раунду, сбросе матча.
   */
  setNextRoundWait(state: NextRoundWait | null): void;
  render(): void;
}

/** Всё, что нужно каркасу, чтобы стать приложением конкретной игры. */
export interface ShellOptions<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
> extends AppOptions<S, M, V, R, O> {
  readonly game: {
    readonly engine: GameEngine<S, M, V, R, L, O>;
    readonly view: GameView<S, M, V, R, L, O>;
    readonly board: BoardFactory<S, M>;
  };
  /** Ключи хранилища: сейв матча и настройки интерфейса. */
  readonly keys: { readonly match: string; readonly ui: string };
  readonly i18n: ShellI18n;
  /** Тексты каркаса на текущем языке. */
  texts(): ShellTexts;
  /** Версия приложения и коммит сборки — для строки версии. */
  readonly build: { readonly version: string; readonly hash: string };
}

export type { BotSeat };
