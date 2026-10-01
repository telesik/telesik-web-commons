// Каркас приложения домино-игры на двоих: экраны, руки, базар, история,
// настройки, оркестровка ходов. Игру каркас знает через движок, стол и
// игровые виды (types.ts); разметку страницы и стили даёт игра.
//
// Разметка страницы, на которую опирается каркас: #topbar .brand,
// #round-chip, #status-event, #status-prompt, #hand-top, #hand-bottom,
// #board (svg), #boneyard, #tutor-bar, #confirm-bar, #history-bar, #toast,
// #overlay, кнопки #btn-hist, #btn-fit, #btn-settings, #btn-new.
// Атрибуты, на которые вправе опираться платформенная надстройка:
// data-action (кнопки карточек, в том числе «continue»), data-tile и
// data-player (кости руки), data-pile (кости кучи), data-move (тени ходов).

import type { BotLevel, MoveCore, RoundCore, RoundResultCore, Seat } from '../engine';
import { esc } from '../html';
import { gearSvg } from '../icons';
import { finishRound, nextRound, startMatch, type MatchState } from '../match';
import { matchProtocol, replayRound, type RoundProtocol } from '../replay';
import { seedFromCrypto } from '../rng';
import { playDraw, playPlace, playShuffle, setSoundEnabled } from '../sound';
import { localStore, matchSave, writeJson, type KVStore } from '../store';
import { ensureTileDefs, tileFace, tileSvgElement } from '../tile-svg';
import { parseTile, pipSum, type TileId } from '../tiles';
import { dragIntent, nearestAngle, pickSnap } from './drag-snap';
import { drawLot } from './lot';
import { nextRoundButton } from './next-round-button';
import {
  killSprites,
  nearestPileSprite,
  pileTileHtml,
  pileZone,
  scatterSprites,
  type PileSprite,
} from './pile';
import { fmtDuration, matchTimes } from './timing';
import type { AppHandle, NextRoundWait, ScreenPose, ShellApi, ShellOptions, TurnCtx } from './types';

/** Длинная сторона HTML-клона кости в полёте и под пальцем, px. */
const FLY_PX = 88;
/** Сколько раундов нужно доиграть, прежде чем предложить убрать подсказки. */
const TUTOR_ENOUGH = 3;
/** Палец держит кость чуть в стороне стола: под пальцем её не видно. */
const DRAG_LIFT_PX = 34;
/** Прилипание: длина кости на экране, но не меньше пальца. */
const SNAP_MIN_PX = 44;
const DRAG_RETURN_MS = 200;

const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'strong'];

/** Перетягивание кости из руки: от нажатия до отпускания. */
interface TileDrag<M> {
  readonly pointerId: number;
  readonly tile: TileId;
  readonly player: Seat;
  /** Палец или перо: кость берётся только движением поперёк ряда руки. */
  readonly touch: boolean;
  readonly startX: number;
  readonly startY: number;
  /** Клон под пальцем; null — кость ещё не взята (нажатие без движения). */
  clone: HTMLElement | null;
  /** Вариант позиции, к которому кость сейчас прилипла. */
  snap: M | null;
  /** Текущий угол клона: доворот к тени идёт от него коротким путём. */
  angle: number;
}

export function initShell<
  S extends RoundCore<M, R, L>,
  M extends MoveCore,
  V,
  R extends RoundResultCore,
  L,
  O,
>(opts: ShellOptions<S, M, V, R, L, O>): AppHandle<S, M, V, R, O> {
  type Match = MatchState<S, M, V, R, O>;
  const { engine, view } = opts.game;
  const i18n = opts.i18n;
  /** Тексты каркаса на текущем языке. */
  const T = opts.texts;
  const LS_KEY = opts.keys.match;
  const LS_UI_KEY = opts.keys.ui;
  const store: KVStore = opts.storage ?? localStore();

  // Дополнительные пункты соперника имеют смысл только вместе с обработчиком
  // старта: пункт без onOpponentStart делал бы кнопку старта молча мёртвой.
  const extraOpponents = opts.onOpponentStart ? (opts.opponentOptions ?? []) : [];
  const extraToggles = opts.extraToggles ?? [];
  const extraActions = opts.extraActions ?? [];
  const startCardActions = extraActions.filter((a) => a.startCard);
  /** Уровни бота — только у игры с ботом. */
  const botLevels: readonly BotLevel[] = engine.chooseBotMove ? BOT_LEVELS : [];
  /** Состояния переключателей платформы; ключ — id переключателя. */
  const toggleState = new Map<string, boolean>();
  // Общие SVG-определения (градиенты, тени) — один раз на документ:
  // на них ссылаются и стол, и кости в руках, и базар, и слайды обучения.
  ensureTileDefs();
  // Логотип перед именем игры в шапке стола.
  const brand = document.querySelector<HTMLElement>('#topbar .brand');
  if (brand && !brand.querySelector('.brand-logo')) {
    brand.insertAdjacentHTML('afterbegin', view.logo(26, 'brand-logo'));
  }

  // Бейдж версии в правом нижнем углу: версия приложения, версия правил
  // (ссылка на их текст) и коммит сборки — для разбора багов.
  const badge = document.createElement('div');
  badge.id = 'version-badge';
  document.body.appendChild(badge);

  // Строка версии — одна на бейдж в углу и на стартовую карточку: игрок видит,
  // что за сборка, не начав партию, и может назвать её в отчёте о баге.
  function versionLine(): string {
    const rules = `<a href="${view.rulesUrl()}" target="_blank" rel="noopener">${T().rulesWord(engine.rulesVersion)}</a>`;
    return `${T().versionWord} ${opts.build.version} (${rules}, ${opts.build.hash})`;
  }

  function updateBadge(): void {
    badge.innerHTML = versionLine();
  }

  // --- DOM ------------------------------------------------------------------
  const $ = <E extends HTMLElement = HTMLElement>(sel: string): E => {
    const el = document.querySelector<E>(sel);
    if (!el) throw new Error(`Нет элемента ${sel}`);
    return el;
  };
  const elRoundChip = $('#round-chip');
  const elStatusEvent = $('#status-event');
  const elStatusPrompt = $('#status-prompt');
  const elHandTop = $('#hand-top');
  const elHandBottom = $('#hand-bottom');
  const elBoneyard = $('#boneyard');
  const elToast = $('#toast');
  const elOverlay = $('#overlay');
  const elHistoryBar = $('#history-bar');
  const elTutorBar = $('#tutor-bar');
  const elConfirmBar = $('#confirm-bar');
  const elBtnHist = $('#btn-hist');
  const elBtnFit = $('#btn-fit');
  const elBtnNew = $('#btn-new');
  const elBtnSettings = $('#btn-settings');
  const svgBoard = document.querySelector<SVGSVGElement>('#board')!;
  // Значок шестерёнки один на шапку и стартовую карточку: в разметке
  // страницы кнопка пустая, путь подставляется здесь.
  elBtnSettings.innerHTML = gearSvg();

  // --- Состояние ---------------------------------------------------------------
  let match: Match | null = null;
  let selected: TileId | null = null;
  /** Ход, ожидающий подтверждения (режим подтверждения ходов). */
  let pending: M | null = null;
  /** Момент выбора черновика: гасит случайный двойной клик как «подтверждение». */
  let pendingAt = 0;
  let pileSprites: PileSprite[] = [];
  let pileRoundKey = -1;
  let animateSeq: number | null = null;
  /** Кость, скрытая на столе, пока к месту летит её клон. */
  let flyingSeq: number | null = null;
  let flightCancel: (() => void) | null = null;
  /** Кость, которую тянут из руки к столу. */
  let drag: TileDrag<M> | null = null;
  /** Кость в руке, скрытая, пока её клон под пальцем или летит назад в руку. */
  let dragHidden: { readonly player: Seat; readonly tile: TileId } | null = null;
  /** Клик, которым браузер завершает перетягивание, ходом не считается. */
  let swallowClick = false;
  let showRoundOver = false;
  let roundOverTimer = 0;
  let autoPassTimer = 0;
  let autoPassForLog = -1;
  let toastTimer = 0;

  // Режим истории: просмотр раундов по протоколу.
  interface ReplayData {
    readonly names: readonly [string, string];
    readonly variant: V;
    readonly rounds: readonly RoundProtocol<M, R>[];
  }
  let replay: { data: ReplayData; roundIdx: number; step: number } | null = null;
  let replayLastKey = '';
  // Ключ последней автопрокрутки руки — прокручиваем один раз на ход.
  let handAutoScrollKey = '';

  // Настройки вида (переживают перезагрузку).
  let autoFitOn = true;
  let soundOn = true;
  let confirmOn = false;
  // Обучение включено с первого запуска: новичок сразу видит подсказки, а
  // после TUTOR_ENOUGH раундов получает одноразовое предложение их убрать.
  // Выключается явно — настройкой или тем предложением.
  let tutorOn = true;
  /** Сколько раундов доиграно за всё время — по ним предлагаем убрать подсказки. */
  let roundsDone = 0;
  /** Предложение выключить обучение делается один раз и больше не возвращается. */
  let tutorAsked = false;
  // Помимо встроенных значений допускает id пунктов из opts.opponentOptions.
  type OpponentPref = 'human' | BotLevel | (string & {});
  // Первый запуск — против лёгкого бота: игру можно попробовать сразу, без
  // второго человека; выбор запоминается.
  let opponentPref: OpponentPref = botLevels[0] ?? (view.hotSeat ? 'human' : (extraOpponents[0]?.id ?? 'human'));
  // Имена игроков переживают перезапуск (пустая строка = не задано).
  let savedP1 = '';
  let savedP2 = '';
  /**
   * Обучение один раз после установки: показано ли оно. Первый запуск —
   * когда сохранённых настроек интерфейса нет вовсе; у игравших раньше
   * настройки есть, им обучение не навязываем, даже если ключа howtoShown
   * в них ещё нет (обновление с прежней версии).
   */
  let howtoShown = true;
  try {
    const rawPrefs = store.get(LS_UI_KEY);
    const prefs = JSON.parse(rawPrefs ?? '{}') as {
      howtoShown?: boolean;
      autoFit?: boolean;
      sound?: boolean;
      locale?: string;
      confirm?: boolean;
      tutor?: boolean;
      opponent?: string;
      p1Name?: string;
      p2Name?: string;
      toggles?: Record<string, boolean>;
      roundsDone?: number;
      tutorAsked?: boolean;
      game?: Record<string, unknown>;
    } | null;
    if (prefs === null || typeof prefs !== 'object') throw new Error('настройки испорчены');
    view.loadPrefs(view.prefsFlat ? (prefs as Record<string, unknown>) : (prefs.game ?? {}));
    if (typeof prefs.p1Name === 'string') savedP1 = prefs.p1Name.slice(0, 16);
    if (typeof prefs.p2Name === 'string') savedP2 = prefs.p2Name.slice(0, 16);
    autoFitOn = prefs.autoFit !== false;
    soundOn = prefs.sound !== false;
    confirmOn = !!prefs.confirm;
    // «Включено, пока явно не выключили»: prefs.tutor пишется при каждом
    // сохранении настроек, поэтому у игравших раньше там лежит их выбор
    // (в т.ч. false), а включённое обучение достаётся только первому запуску.
    tutorOn = prefs.tutor !== false;
    roundsDone = Math.max(0, Math.trunc(prefs.roundsDone ?? 0));
    tutorAsked = !!prefs.tutorAsked;
    howtoShown = rawPrefs === null ? false : prefs.howtoShown !== false;
    const validOpp = [
      ...(view.hotSeat ? ['human'] : []),
      ...botLevels,
      ...extraOpponents.map((o) => o.id),
    ];
    if (validOpp.includes(prefs.opponent ?? '')) {
      opponentPref = prefs.opponent as OpponentPref;
    }
    for (const t of extraToggles) {
      toggleState.set(t.id, prefs.toggles?.[t.id] ?? t.initial);
    }
    i18n.setLocale(i18n.detectLocale(prefs.locale ?? null));
  } catch {
    i18n.setLocale(i18n.detectLocale(null));
  }
  setSoundEnabled(soundOn);
  // Сохранённое состояние переключателей применяем сразу: иначе галочка
  // показывала бы одно, а платформа делала другое до первого переключения.
  for (const t of extraToggles) {
    if (!toggleState.has(t.id)) toggleState.set(t.id, t.initial);
    t.onChange(toggleState.get(t.id) === true);
  }

  function markHowtoShown(): void {
    if (howtoShown) return;
    howtoShown = true;
    persistUi();
  }

  function persistUi(): void {
    const common = {
      autoFit: autoFitOn,
      sound: soundOn,
      locale: i18n.getLocale(),
      confirm: confirmOn,
      tutor: tutorOn,
      opponent: opponentPref,
      p1Name: savedP1,
      p2Name: savedP2,
      toggles: Object.fromEntries(toggleState),
      roundsDone,
      tutorAsked,
      howtoShown,
    };
    writeJson(
      store,
      LS_UI_KEY,
      view.prefsFlat ? { ...view.dumpPrefs(), ...common } : { ...common, game: view.dumpPrefs() },
    );
  }

  const board = opts.game.board(svgBoard, {
    onMove(move) {
      if (replay || notMyTurn()) return;
      if (performance.now() - lastDispatchAt < 300) return;
      // Режим подтверждения: клик по тени лишь выбирает ход; ставит его
      // повторный клик по той же тени или кнопка подтверждения.
      if (confirmOn && view.moveKind(move) === 'place') {
        if (pending && view.samePlacement(move, pending)) {
          // Повторный клик подтверждает, но не раньше 350 мс после выбора:
          // иначе случайный двойной клик обходил бы весь смысл режима.
          if (performance.now() - pendingAt < 350) return;
          dispatch(pending);
        } else {
          pending = move;
          pendingAt = performance.now();
          renderAll();
        }
        return;
      }
      dispatch(move);
    },
    onViewChange(auto) {
      autoFitOn = auto;
      persistUi();
      elBtnFit.classList.toggle('active', auto);
    },
  });

  const api: ShellApi<S, M, V, R, O> = {
    board,
    getMatch: () => match,
    setRound(round) {
      if (!match) return;
      match = { ...match, round };
      persist();
      renderAll();
    },
    isReplay: () => replay !== null,
    remoteSeat: () => remoteSeat,
    render: () => renderAll(),
    persistUi,
    toast: (text, warn) => toast(text, warn),
  };
  // Игра вешает свои кнопки и применяет сохранённые настройки вида до
  // первого рендера — иначе стол успел бы мигнуть видом по умолчанию.
  view.mount?.(api);

  // --- Утилиты -----------------------------------------------------------------

  /** Имя игрока идущего матча. */
  const nameOf = (p: Seat): string => match!.names[p];

  // Сейв матча — в конверте с версией; отказ хранилища (приватный режим) не
  // страшен. Разбор кэшируется по строке из хранилища: карточка старта
  // перерисовывается на смену языка и соперника, а JSON.parse и проверка
  // всего матча каждый раз — лишние.
  const saved = matchSave<Match>(store, LS_KEY, { v: 2, validate: (raw) => view.validateSaved(raw) });

  function persist(): void {
    if (match) saved.save(match);
  }

  function toast(text: string, warn = false): void {
    clearTimeout(toastTimer);
    elToast.textContent = text;
    elToast.classList.toggle('warn', warn);
    elToast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elToast.hidden = true;
    }, 2600);
  }

  /** Рубашка кости кучи. */
  const pileBack = (): string => tileSvgElement(view.tileBack({ shadow: 'flat' }), 78);

  function ensurePileSprites(m: Match): void {
    const key = m.rounds.length;
    if (key === pileRoundKey) return;
    pileRoundKey = key;
    pileSprites = scatterSprites(m.round.seed, view.pileSize);
    // Если раунд продолжен из сохранения — часть кучи уже разобрана.
    killSprites(pileSprites, view.pileSize - m.round.boneyard.length);
  }

  // --- Бот и внешние места ----------------------------------------------------

  /**
   * Место, управляемое извне (setRemoteSeat): его ходы приходят через
   * handle.dispatch, локальный ввод в его ход заблокирован.
   */
  let remoteSeat: Seat | null = null;
  /** Договор о следующем раунде с внешним игроком (см. AppHandle). */
  let nextRoundWait: NextRoundWait | null = null;

  /**
   * Чья рука внизу экрана. В игре за одним экраном и с ботом это всегда
   * первое место. В игре с внешним соперником у каждого свой экран, и каждый
   * должен видеть свою руку снизу, а чужую сверху — как за настоящим столом
   * напротив.
   */
  function bottomSeat(): Seat {
    return remoteSeat === null ? 0 : ((1 - remoteSeat) as Seat);
  }

  /** Контейнер руки игрока с учётом того, кто сидит «снизу». */
  function handEl(player: Seat): HTMLElement {
    return player === bottomSeat() ? elHandBottom : elHandTop;
  }

  /** Сейчас очередь бота (именно бота — его ход генерирует scheduleBotMove). */
  function botsTurnNow(): boolean {
    return (
      !replay &&
      !!match &&
      match.bot != null &&
      match.round.phase !== 'over' &&
      match.round.current === match.bot.player
    );
  }

  /**
   * Сейчас ход не человека за этим экраном (бот или внешнее место): клики по
   * игровым элементам недоступны.
   */
  function notMyTurn(): boolean {
    if (botsTurnNow()) return true;
    return (
      !replay &&
      !!match &&
      remoteSeat !== null &&
      match.round.phase !== 'over' &&
      match.round.current === remoteSeat
    );
  }

  let botTimer = 0;

  /** Ход бота с человеческой паузой. Вызывается после каждого рендера. */
  function scheduleBotMove(): void {
    clearTimeout(botTimer);
    if (!botsTurnNow()) return;
    botTimer = window.setTimeout(() => {
      if (!botsTurnNow() || !match) return;
      try {
        const round = match.round;
        const move = engine.chooseBotMove!(round, {
          seat: match.bot!.player,
          level: match.bot!.level,
          totals: match.totals,
          // Случайность бота привязана к позиции: тот же раунд и тот же ход — тот же выбор.
          seed: (round.seed ^ Math.imul(round.history.length + 1, 0x9e3779b1)) >>> 0,
        });
        if (view.moveKind(move) === 'draw') playDraw();
        dispatch(move);
      } catch (err) {
        console.error(err);
      }
    }, 750);
  }

  /**
   * HTML-клон кости для полёта (рука → стол, куча → рука): лицо без тени,
   * FLY_PX по длинной стороне; в документ добавляет и убирает вызывающий.
   */
  function makeFlyingTile(values: readonly [number, number], extraClass = ''): HTMLElement {
    const el = document.createElement('div');
    el.className = extraClass ? `flying-tile ${extraClass}` : 'flying-tile';
    el.innerHTML = tileSvgElement(tileFace(values[0], values[1], { shadow: 'flat' }), FLY_PX);
    return el;
  }

  /** Кость в руке как старт полёта: центр её места, стоит вертикально. */
  function handPose(rect: DOMRect): ScreenPose {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, angle: 90, scale: FLY_PX };
  }

  /**
   * Полёт кости из руки к месту установки. Цель пересчитывается каждый кадр:
   * автомасштаб в это же время может панорамировать и зумить стол.
   */
  function flyPlacement(seq: number, values: readonly [number, number], start: ScreenPose): void {
    flightCancel?.();
    flyingSeq = seq; // отменённый полёт мог сбросить флаг скрытия
    const clone = makeFlyingTile(values, 'fly-place');
    document.body.appendChild(clone);
    const startAngle = start.angle;
    const startScale = start.scale / FLY_PX;
    const t0 = performance.now();
    const dur = 340;
    let raf = 0;
    const finish = (): void => {
      cancelAnimationFrame(raf);
      clone.remove();
      flyingSeq = null;
      flightCancel = null;
      document.querySelector(`.placed[data-seq="${seq}"]`)?.classList.remove('incoming');
    };
    flightCancel = finish;
    const frame = (): void => {
      const target = board.placedScreenPoint(seq);
      if (!target) {
        finish();
        return;
      }
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const x = start.x + (target.x - start.x) * e;
      const y = start.y + (target.y - start.y) * e;
      const angle = startAngle + (target.angle - startAngle) * e;
      const scale = startScale + (target.scale / FLY_PX - startScale) * e;
      clone.style.left = `${x - 44}px`;
      clone.style.top = `${y - 22}px`;
      clone.style.transform = `rotate(${angle}deg) scale(${scale.toFixed(3)})`;
      if (t >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // --- Основной диспетчер --------------------------------------------------------

  // Метка последнего применённого хода: гасит второй клик двойного клика,
  // прилетающий уже в перерисованный DOM (куча базара, тени).
  let lastDispatchAt = 0;

  // --- Время на ход ---------------------------------------------------------------
  // Замер честный: от показа позиции до dispatch. Всё, что разбивает ход
  // (уход приложения с глаз, просмотр истории, восстановление из сейва),
  // обнуляет turnStartedAt — такой ход уходит в историю без t.
  let turnStartedAt: number | null = null;
  let turnKey = '';
  /** Матч восстановлен из сейва: первый показанный ход не мерить. */
  let spoilNextTurn = false;

  /**
   * external — ход рождён не за этим экраном (сетевая надстройка): своё t не
   * подставляем, пришедшее не трогаем.
   */
  function dispatch(move: M, external = false, flyStart?: ScreenPose): void {
    if (replay || !match || match.round.phase === 'over') return;
    if (!external && move.t === undefined && turnStartedAt !== null) {
      move = { ...move, t: Math.max(0, Math.round(performance.now() - turnStartedAt)) };
    }
    clearTimeout(autoPassTimer);
    // Точка старта полёта: кость в руке ходящего (до применения хода).
    let flyFrom: DOMRect | null = null;
    if (view.moveKind(move) === 'place') {
      const cur = match.round.current;
      // Кость закрытой руки в DOM не названа — полёт стартует от самой руки.
      const el =
        document.querySelector(
          `.hand-tile[data-player="${cur}"][data-tile="${view.moveTile(move, match.round)}"]`,
        ) ?? handEl(cur);
      flyFrom = el.getBoundingClientRect();
    }
    let round: S;
    try {
      round = engine.applyMove(match.round, move);
    } catch (err) {
      console.error(err);
      return;
    }
    match = { ...match, round };
    selected = null;
    pending = null;
    lastDispatchAt = performance.now();
    animateSeq = view.placedSeqOf(move, round);
    if (animateSeq !== null) playPlace(view.placeSound(move, round));

    if (round.phase === 'over') {
      match = finishRound(engine, match);
      roundsDone++;
      persistUi();
      showRoundOver = false;
      clearTimeout(roundOverTimer);
      roundOverTimer = window.setTimeout(() => {
        showRoundOver = true;
        renderAll();
      }, 1100);
    }
    const placedSeq = animateSeq;
    if (placedSeq !== null && flyFrom) flyingSeq = placedSeq;
    persist();
    opts.onMove?.(move, round);
    if (round.phase === 'over' && match.outcome) opts.onMatchOver?.(match);
    renderAll();
    if (placedSeq !== null) {
      // Перетянутая кость уже стоит на своей тени — долетает оттуда, а не из руки.
      if (flyFrom) flyPlacement(placedSeq, view.placedValues(round, placedSeq), flyStart ?? handPose(flyFrom));
      // Автомасштаб сам держит всё в кадре; без него доводим кость минимальным
      // сдвигом — после смены раскладки она могла уехать за край.
      if (!board.isAutoFit()) board.ensureVisible(placedSeq);
    }
  }

  // --- Рендер ----------------------------------------------------------------

  function renderAll(): void {
    dropStaleDrag();
    if (replay) {
      elTutorBar.hidden = true;
      elConfirmBar.hidden = true;
      view.onRender?.(null);
      renderReplayView();
      return;
    }
    elHistoryBar.hidden = true;
    elBtnHist.classList.remove('active');
    if (!match) {
      elTutorBar.hidden = true;
      elConfirmBar.hidden = true;
      view.onRender?.(null);
      renderStartScreen();
      return;
    }
    const round = match.round;
    const legal = round.phase === 'over' ? [] : engine.legalMoves(round);

    // Ход начинается, когда позиция показана: смена ключа заводит таймер
    // заново. Seed в ключе различает и раунды, и матчи — иначе первая
    // позиция любого матча («0 ходов») совпадала бы с первой позицией
    // предыдущего. Повторные рендеры того же хода (смена языка, пан и зум)
    // таймер не трогают; скрытое окно сразу портит замер.
    const tk = `${round.seed}|${round.history.length}`;
    if (tk !== turnKey) {
      turnKey = tk;
      turnStartedAt = spoilNextTurn || document.hidden ? null : performance.now();
      spoilNextTurn = false;
    }

    deriveSelection(round, legal);
    ensurePileSprites(match);
    renderTopbar(match, legal);
    // В чужой ход (бот или удалённый соперник) руки и куча не приглашают
    // к действию: без классов playable и can-draw — кликать всё равно нельзя.
    const legalUi = notMyTurn() ? [] : legal;
    renderHand(0, round, legalUi);
    renderHand(1, round, legalUi);
    renderBoneyard(round, legalUi);
    renderBoard(round, legal);
    renderTutorBar(round, legal);
    renderConfirmBar(round, legal);
    renderOverlay(match);
    scheduleAutoPass(round, legal);
    scheduleBotMove();
    animateSeq = null;
  }

  /** Кости руки, у которых есть легальный ход. */
  function tilesOf(round: S, legal: readonly M[]): Set<TileId> {
    const out = new Set<TileId>();
    for (const m of legal) {
      const t = view.moveTile(m, round);
      if (t !== null) out.add(t);
    }
    return out;
  }

  function deriveSelection(round: S, legal: readonly M[]): void {
    if (round.phase === 'over' || notMyTurn()) {
      // В чужой ход (бот или удалённый соперник) человеку нечего выбирать:
      // без выделения, без теней.
      selected = null;
      if (round.phase === 'over') return;
      if (pending) pending = null;
      return;
    }
    const forced = view.forcedTile(round);
    if (forced) {
      selected = forced;
      return;
    }
    const placeable = tilesOf(round, legal);
    if (selected && !placeable.has(selected)) selected = null;
    if (!selected && placeable.size === 1) selected = [...placeable][0]!;
    // Черновик хода живёт, только пока выбрана его кость.
    if (pending) {
      const tile = view.moveTile(pending, round);
      if (tile !== null && tile !== selected) pending = null;
    }
  }

  function turnCtx(round: S, legal: readonly M[]): TurnCtx<M> {
    return { legal, selected, nameHtml: `<b>${esc(nameOf(round.current))}</b>` };
  }

  function renderTopbar(m: Match, legal: readonly M[]): void {
    const round = m.round;
    elRoundChip.textContent = T().roundChip(m.rounds.length + (round.phase === 'over' ? 0 : 1));
    const { event, prompt } = statusTexts(round, legal);
    elStatusEvent.textContent = event;
    elStatusPrompt.innerHTML = prompt;
    elBtnFit.classList.toggle('active', board.isAutoFit());
    view.onRender?.({ round, remote: remoteSeat !== null });
  }

  function statusTexts(round: S, legal: readonly M[]): { event: string; prompt: string } {
    const last = round.log[round.log.length - 1];
    const event = last ? view.describeLog(last, match!.names, bottomSeat()) : T().statusNewRound;
    if (round.phase === 'over') {
      return { event, prompt: T().statusRoundOver };
    }
    const ctx = turnCtx(round, legal);
    if (notMyTurn()) {
      // Текст нейтральный («Имя: думает…»): этой строкой ждут и бота, и
      // живого соперника сетевой партии.
      return { event, prompt: T().statusBotThinking(ctx.nameHtml) };
    }
    return { event, prompt: view.prompt(round, ctx) };
  }

  /** Режим просмотра руки в истории: активен «ходивший», всё открыто, без кликов. */
  interface HandView {
    readonly mover: Seat | null;
    readonly names: readonly [string, string];
  }

  function renderHand(player: Seat, round: S, legal: readonly M[], hv: HandView | null = null): void {
    const el = handEl(player);
    const hand = round.hands[player];
    // «Активный» игрок: в живой игре — чей ход, в истории — кто сделал
    // показанный ход. Отмечается рамкой руки и рукой-указателем у имени.
    const isActive = hv ? hv.mover === player : round.phase !== 'over' && round.current === player;
    const hidden = !hv && view.handHidden(round, player, bottomSeat());
    const name = hv ? hv.names[player] : nameOf(player);
    el.classList.toggle('active', isActive);

    const playable = !hv && isActive ? tilesOf(round, legal) : new Set<TileId>();
    const forced = view.forcedTile(round);

    // Общий счёт матча — бейджем у имени (в шапке ему тесно на телефонах).
    const totalChip = !hv && match ? view.totalChip(match, player) : '';
    const meta = `
      <div class="hand-meta">
        <div class="hand-name">${
          isActive ? `<span class="turn-mark" title="${T().turnMarkTitle}">☞</span>` : ''
        }${
          round.first === player ? `<span class="first-chip">${T().firstChip}</span>` : ''
        }${esc(name)}${totalChip}</div>
        <div class="hand-sum">${view.handMeta(round, player, hidden)}</div>
      </div>`;

    const tiles = hand
      .map((t) => {
        const p = parseTile(t);
        const cls = [
          'hand-tile',
          playable.has(t) ? 'playable' : '',
          !hv && isActive && !playable.has(t) && !hidden ? 'dimmed' : '',
          !hv && selected === t && isActive ? 'selected' : '',
          // Пульс обязательной (вытянутой) кости — только на устройстве
          // ходящего: наблюдателю чужого хода чужая добранная кость не
          // подсвечивается. За одним экраном ходящий и есть смотрящий.
          !hv && forced === t && isActive && !botsTurnNow() && !notMyTurn() ? 'must' : '',
          // Кость под пальцем (или летит назад): место в руке за ней остаётся.
          !hv && dragHidden?.tile === t && dragHidden.player === player ? 'incoming' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const inner = hidden ? view.tileBack({ shadow: 'flat' }) : tileFace(p.hi, p.lo, { shadow: 'flat' });
        // Скрытой руке идентификаторы костей в DOM не выдаём: клики по ней
        // всё равно невозможны, а инспектор браузера не должен подсматривать.
        const attrs = hidden || hv ? '' : ` data-player="${player}" data-tile="${t}"`;
        return `<div class="${cls}"${attrs}>
          ${tileSvgElement(inner, 86, { vertical: true })}
        </div>`;
      })
      .join('');

    const prevScroll = el.querySelector<HTMLElement>('.hand-tiles')?.scrollLeft ?? 0;
    el.innerHTML = `${meta}<div class="hand-tiles">${tiles}</div>`;

    // Перерисовка не должна сбрасывать ручную прокрутку руки…
    const cont = el.querySelector<HTMLElement>('.hand-tiles');
    if (cont) {
      cont.scrollLeft = prevScroll;
      // …а в начале своего хода рука мягко подъезжает к первой играбельной
      // кости, если та за краем (актуально для раздутых добором рук).
      if (!hv && isActive && playable.size > 0) {
        const key = `${match!.rounds.length}:${round.log.length}:${player}`;
        if (handAutoScrollKey !== key) {
          handAutoScrollKey = key;
          const first = cont.querySelector<HTMLElement>('.hand-tile.playable');
          if (first) {
            const x = first.getBoundingClientRect().left - cont.getBoundingClientRect().left + cont.scrollLeft;
            const fits = x >= cont.scrollLeft + 4 && x + first.offsetWidth <= cont.scrollLeft + cont.clientWidth - 4;
            if (!fits) {
              cont.scrollTo({ left: Math.max(0, x - 28), behavior: 'smooth' });
            }
          }
        }
      }
    }
  }

  function renderBoneyard(round: S, legal: readonly M[]): void {
    const canDraw = legal.some((m) => view.moveKind(m) === 'draw');
    elBoneyard.classList.toggle('can-draw', canDraw);
    // Добор бота идёт мимо onPileClick — синхронизируем спрайты с базаром:
    // гасим первые живые, пока их не станет ровно столько, сколько костей.
    killSprites(pileSprites, view.pileSize - round.boneyard.length);
    const alive = pileSprites.filter((s) => s.alive).length;
    // Куча уже отрисована и совпадает по составу — не трогаем DOM зря.
    // Язык — часть ключа: иначе подпись «базар: N» переживала бы смену языка.
    const key = `${i18n.getLocale()}|${pileRoundKey}|${alive}|${round.boneyard.length}`;
    if (elBoneyard.dataset.key === key) return;
    elBoneyard.dataset.key = key;
    const back = pileBack();
    const tiles = pileSprites.map((s, i) => (s.alive ? pileTileHtml(s, back, i) : '')).join('');
    const count = round.boneyard.length;
    elBoneyard.innerHTML = `${tiles}<div class="pile-count">${T().pileCount(count)}</div>`;
  }

  function renderBoard(round: S, legal: readonly M[]): void {
    board.render(round, {
      ghostMoves: selected === null ? [] : view.ghostMoves(round, legal, selected),
      selected,
      animateSeq,
      interactive: round.phase !== 'over',
      game: view.boardFlags?.(bottomSeat()),
      // Тень, к которой прилипла перетягиваемая кость, выглядит как черновик.
      pending: drag?.snap ?? pending,
      hideSeq: flyingSeq,
    });
  }

  // --- Режим обучения и подтверждение хода -----------------------------------------

  /** Подсказка режима обучения: что сейчас можно сделать и как. */
  function tutorText(round: S, legal: readonly M[]): string {
    if (round.phase === 'over') return view.tutorOver(round);
    // Ход не человека за этим экраном: бот думает сам, а за удалённым
    // местом сидит живой игрок — «ботом» его не называть.
    if (botsTurnNow()) return T().tutorBotTurn;
    if (notMyTurn()) return T().tutorRemoteTurn;
    if (pending) return T().tutorPending;
    return view.tutor(round, turnCtx(round, legal));
  }

  function renderTutorBar(round: S, legal: readonly M[]): void {
    if (!tutorOn) {
      elTutorBar.hidden = true;
      return;
    }
    // Текст подсказки и галочка «показывать правила игры»: снять её — то же,
    // что выключить режим обучения в настройках.
    elTutorBar.innerHTML = `<div class="tutor-text">${esc(tutorText(round, legal))}</div>
      <label class="tutor-toggle"><input type="checkbox" checked data-tutor-toggle>${esc(T().tutorShowRules)}</label>`;
    elTutorBar.hidden = false;
  }
  elTutorBar.addEventListener('change', (ev) => {
    const cb = ev.target as HTMLInputElement;
    if (!cb.matches('[data-tutor-toggle]') || cb.checked) return;
    tutorOn = false;
    tutorAsked = true; // явный выбор игрока — вопрос «выключить подсказки?» больше не нужен
    persistUi();
    renderAll();
  });

  function renderConfirmBar(round: S, legal: readonly M[]): void {
    // Самолечение: черновик обязан оставаться легальным ходом (смена раунда
    // и т.п. делают его устаревшим).
    if (pending && !legal.some((m) => engine.moveEquals(m, pending!))) pending = null;
    if (!pending || round.phase === 'over') {
      elConfirmBar.hidden = true;
      return;
    }
    elConfirmBar.innerHTML =
      `<span class="confirm-q">${esc(view.confirmQuestion(pending, round))}</span>` +
      `<button id="confirm-yes" class="confirm-btn yes">${esc(T().confirmYes)}</button>` +
      `<button id="confirm-no" class="confirm-btn no">${esc(T().confirmNo)}</button>`;
    elConfirmBar.hidden = false;
  }

  elConfirmBar.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.id === 'confirm-yes' && pending) {
      dispatch(pending);
    } else if (t.id === 'confirm-no') {
      pending = null;
      renderAll();
    }
  });

  function scheduleAutoPass(round: S, legal: readonly M[]): void {
    clearTimeout(autoPassTimer);
    if (round.phase === 'over') return;
    // Пас внешнего места не разыгрывается локально — он придёт через dispatch,
    // иначе обе стороны отправили бы его одновременно.
    if (remoteSeat !== null && round.current === remoteSeat) return;
    const only = legal.length === 1 ? legal[0]! : null;
    if (only && view.moveKind(only) === 'pass') {
      // Тост показываем один раз, но таймер перезаводим при каждом рендере:
      // любой промежуточный рендер сбрасывает clearTimeout выше.
      if (autoPassForLog !== round.log.length) {
        autoPassForLog = round.log.length;
        toast(T().toastPassAuto(nameOf(round.current)));
      }
      autoPassTimer = window.setTimeout(() => dispatch(only), 1300);
    }
  }

  // --- История ходов (просмотр по протоколу) ---------------------------------------

  function openHistory(): void {
    if (!match) return;
    // Просмотр истории — не обдумывание позиции: замер испорчен.
    turnStartedAt = null;
    // Учтённые раунды плюс текущий, если он идёт.
    const rounds = matchProtocol(engine, match).rounds;
    if (rounds.length === 0) return;
    const roundIdx = rounds.length - 1;
    replay = {
      data: { names: match.names, variant: match.variant, rounds },
      roundIdx,
      step: rounds[roundIdx]!.moves.length,
    };
    clearTimeout(autoPassTimer);
    clearTimeout(roundOverTimer);
    renderAll();
  }

  function exitReplay(): void {
    replay = null;
    replayLastKey = '';
    // Если живой раунд уже завершён — вернуть экран итогов.
    if (match && match.round.phase === 'over') showRoundOver = true;
    renderAll();
  }

  function renderReplayView(): void {
    const rp = replay!;
    const round = rp.data.rounds[rp.roundIdx]!;
    const total = round.moves.length;
    rp.step = Math.max(0, Math.min(rp.step, total));
    let state: S;
    try {
      state = replayRound(engine, round, rp.data.variant, rp.roundIdx, rp.step);
    } catch (err) {
      toast(T().toastProtoBroken((err as Error).message), true);
      exitReplay();
      return;
    }
    const prev = replayLastKey.split(':');
    const forward = prev[0] === String(rp.roundIdx) && Number(prev[1]) < rp.step;
    replayLastKey = `${rp.roundIdx}:${rp.step}`;

    const lastLog = state.log[state.log.length - 1];
    const mover: Seat | null = lastLog ? view.logSeat(lastLog) : null;

    elBtnHist.classList.add('active');
    elRoundChip.textContent = T().viewChip(rp.roundIdx + 1, rp.data.rounds.length);
    elStatusEvent.textContent = T().historyLive;
    // После раздачи показывается запись о последнем показанном ходе: каждый ход оставляет запись в журнале.
    elStatusPrompt.innerHTML =
      rp.step === 0
        ? T().historyDeal(`<b>${esc(rp.data.names[round.first])}</b>`)
        : esc(view.describeLog(lastLog!, rp.data.names, 'all'));

    const handView: HandView = { mover, names: rp.data.names };
    renderHand(0, state, [], handView);
    renderHand(1, state, [], handView);
    renderBoneyardStatic(state, round.seed);

    const lastMove = rp.step > 0 ? round.moves[rp.step - 1] : undefined;
    board.render(state, {
      ghostMoves: [],
      selected: null,
      animateSeq: forward && lastMove ? view.placedSeqOf(lastMove, state) : null,
      interactive: false,
      game: view.boardFlags?.(bottomSeat()),
    });
    elOverlay.hidden = true;
    renderHistoryBar(rp, total);
  }

  /** Куча базара в режиме истории: раскладка по seed раунда, без кликов. */
  function renderBoneyardStatic(state: S, seed: number): void {
    elBoneyard.classList.remove('can-draw');
    const count = state.boneyard.length;
    // Язык в ключе — по той же причине, что и в renderBoneyard.
    const key = `replay|${i18n.getLocale()}|${seed}|${count}`;
    if (elBoneyard.dataset.key === key) return;
    elBoneyard.dataset.key = key;
    // Первые count спрайтов раскладки — «ещё в куче», как и в живом раунде.
    const back = pileBack();
    const tiles = scatterSprites(seed, view.pileSize)
      .slice(0, count)
      .map((s) => pileTileHtml(s, back))
      .join('');
    elBoneyard.innerHTML = `${tiles}<div class="pile-count">${T().pileCount(count)}</div>`;
  }

  function renderHistoryBar(rp: NonNullable<typeof replay>, total: number): void {
    elHistoryBar.hidden = false;
    // Язык — часть ключа: селект раундов и подсказки кнопок строятся здесь
    // один раз и без него не обновились бы при смене языка.
    const barKey = `${i18n.getLocale()}|${rp.data.rounds.length}|${rp.roundIdx}|${total}`;
    if (elHistoryBar.dataset.key !== barKey) {
      elHistoryBar.dataset.key = barKey;
      const options = rp.data.rounds
        .map((r, i) => {
          const label = r.result ? view.roundSummary(r.result, i) : T().roundOptLive(i + 1);
          return `<option value="${i}" ${i === rp.roundIdx ? 'selected' : ''}>${label}</option>`;
        })
        .join('');
      elHistoryBar.innerHTML = `
        <button class="icon-btn" data-action="replay-exit" data-tip="${T().tipExitReplay}">✕</button>
        <select id="replay-round" data-tip="${T().tipRoundSelect}">${options}</select>
        <button class="icon-btn" data-action="replay-first" data-tip="${T().tipToDeal}">⏮</button>
        <button class="icon-btn" data-action="replay-prev" data-tip="${T().tipStepBack}">◀</button>
        <input type="range" id="replay-slider" min="0" max="${total}" step="1" value="${rp.step}">
        <button class="icon-btn" data-action="replay-next" data-tip="${T().tipStepFwd}">▶</button>
        <button class="icon-btn" data-action="replay-last" data-tip="${T().tipToEnd}">⏭</button>
        <span id="replay-pos" class="replay-pos"></span>`;
    }
    const slider = document.querySelector<HTMLInputElement>('#replay-slider');
    if (slider && slider.value !== String(rp.step)) slider.value = String(rp.step);
    const pos = document.querySelector<HTMLElement>('#replay-pos');
    if (pos) pos.textContent = T().historyPos(rp.step, total);
  }

  // --- Экраны (оверлей) -----------------------------------------------------------

  function renderOverlay(m: Match): void {
    if (m.round.phase === 'over' && showRoundOver) {
      renderRoundOver(m);
      return;
    }
    elOverlay.hidden = true;
  }

  /** Пункты селектора языка; имена языков написаны на самих языках. */
  function localeOptionsHtml(): string {
    return i18n.locales
      .map(
        ({ code, label }) =>
          `<option value="${code}" ${code === i18n.getLocale() ? 'selected' : ''}>${label}</option>`,
      )
      .join('');
  }

  /**
   * Ряд действий платформы во всю ширину карточки — стартовой и итогов.
   * Без надстройки — пустая строка: пустого блока нет.
   */
  function platformActionsRow(): string {
    if (!startCardActions.length) return '';
    return `<div class="btn-row action-row">${startCardActions
      .map(
        (a) => `<button class="btn ghost-btn" data-action="x-act:${esc(a.id)}">${esc(a.label())}</button>`,
      )
      .join('')}</div>`;
  }

  /** Подпись уровня бота в селекторе соперника. */
  function botOptionLabel(level: BotLevel): string {
    return level === 'easy' ? T().oppBotEasy : level === 'normal' ? T().oppBotNormal : T().oppBotStrong;
  }

  function renderStartScreen(): void {
    const curExtra = extraOpponents.find((o) => o.id === opponentPref);
    const wantLots = curExtra?.needsLots !== false;
    const wantSecondName = curExtra?.needsSecondName !== false;
    const prev = saved.load();
    const savedInfo =
      prev && !prev.outcome
        ? `<button class="btn ghost-btn" data-action="continue">${T().btnContinue(
            `${esc(prev.names[0])} ${prev.totals[0]}:${prev.totals[1]} ${esc(prev.names[1])}`,
          )}</button>`
        : '';
    // Строка ссылок под слоганом: первой — слайды обучения (полный текст
    // правил — с последнего слайда и из строки версии). Остальное — только
    // переданное входом приложения: веб задаёт донат и сторы, мобильные
    // сборки не задают ничего.
    const extLinks: string[] = [`<a class="howto-link" data-action="howto">${T().howtoLink}</a>`];
    if (opts.supportUrl)
      extLinks.push(`<a href="${opts.supportUrl}" target="_blank" rel="noopener">${T().linkSupport}</a>`);
    if (opts.appStoreUrl)
      extLinks.push(`<a href="${opts.appStoreUrl}" target="_blank" rel="noopener">${T().linkAppStore}</a>`);
    if (opts.googlePlayUrl)
      extLinks.push(`<a href="${opts.googlePlayUrl}" target="_blank" rel="noopener">${T().linkGooglePlay}</a>`);
    const opponents: (readonly [string, string])[] = [
      ...(view.hotSeat ? [['human', T().oppHuman] as const] : []),
      ...botLevels.map((lv) => [lv, botOptionLabel(lv)] as const),
      ...extraOpponents.map((o) => [o.id, esc(o.label())] as const),
    ];
    // Язык — прямо на карточке: игрок, не знающий текущего языка, не
    // догадается заглянуть за шестерёнку. Кнопка настроек на карточке: она
    // перекрывает шапку целиком, и шестерёнку шапки отсюда не достать; значок
    // на самой кнопке — чтобы при случайно выбранном чужом языке игрок нашёл
    // настройки, не читая подпись. Подписи полей имён — по выбранному
    // сопернику, а не по положению руки на экране.
    elOverlay.innerHTML = `
      <div class="card">
        <select id="inp-lang-start" class="lang-select lang-corner">${localeOptionsHtml()}</select>
        <h1 class="title-with-logo">${view.titleHtml()}</h1>
        <p class="sub">${T().tagline}</p>
        <p class="sub links-line">${extLinks.join(' · ')}</p>
        <div class="field"><label for="inp-n0">${
          esc(curExtra?.nameLabel?.() ?? '') || (opponentPref === 'human' ? T().fieldName : T().fieldYourName)
        }</label>
          <input id="inp-n0" type="text" value="${esc(savedP1) || T().defaultP1}" maxlength="16"></div>
        ${
          wantSecondName && opponentPref === 'human'
            ? `<div class="field"><label for="inp-n1">${T().fieldOpponentName}</label>
          <input id="inp-n1" type="text" value="${esc(savedP2) || T().defaultP2}" maxlength="16"></div>`
            : ''
        }
        <div class="field"><label for="inp-opp">${T().fieldOpponent}</label>
          <select id="inp-opp" class="lang-select opp-select">
            ${opponents
              .map(([v, label]) => `<option value="${v}" ${v === opponentPref ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select></div>
        ${view.startFields()}
        ${tutorOn ? `<p class="sub tutor-hint">${T().tutorStart}</p>` : ''}
        <hr class="sep">
        ${
          wantLots
            ? `<div class="lot-result" id="lot-result">${T().lotDecides}</div>
        <div class="lot-row" id="lot-row"></div>`
            : ''
        }
        <div class="btn-row start-row">
          ${wantLots ? `<button class="btn" data-action="lot">${T().btnLot}</button>` : ''}
          <button class="btn" data-action="start" ${wantLots ? 'disabled' : ''} id="btn-start">${
            esc(curExtra?.startLabel?.() ?? '') || T().btnStart
          }</button>
          ${savedInfo}
        </div>
        <div class="btn-row">
          <button class="btn ghost-btn" data-action="settings-open">${gearSvg('btn-ico')}${T().settingsTitle}</button>
        </div>
        ${platformActionsRow()}
        <p class="sub version-line">${versionLine()}</p>
      </div>`;
    elOverlay.hidden = false;
  }

  /** Перерисовать стартовую карточку, сохранив несохраняемые галочки игры. */
  function rerenderStartScreen(): void {
    const kept = (view.keepFields ?? []).map(
      (sel) => [sel, document.querySelector<HTMLInputElement>(sel)?.checked] as const,
    );
    renderStartScreen();
    for (const [sel, on] of kept) {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el && on !== undefined) el.checked = on;
    }
  }

  let lotFirst: Seat | null = null;

  /**
   * Имя второго места. У бота оно нередактируемое и говорит об уровне —
   * иначе в идущем матче не видно, с каким ботом играешь; поле ввода при
   * боте не рисуется вовсе. У человека — из поля.
   */
  function secondName(): string {
    if (opponentPref === 'easy') return T().botNameEasy;
    if (opponentPref === 'normal') return T().botNameNormal;
    if (opponentPref === 'strong') return T().botNameStrong;
    return document.querySelector<HTMLInputElement>('#inp-n1')?.value.trim() || T().defaultP2;
  }

  function rollLot(): void {
    const lot = drawLot();
    lotFirst = lot.first;
    const n0 = $<HTMLInputElement>('#inp-n0').value.trim() || T().defaultP1;
    const n1 = secondName();
    const side = (seat: Seat, name: string): string => {
      const t = parseTile(lot.tiles[seat]);
      return `
      <div class="lot-side ${lotFirst === seat ? 'win' : ''}">
        ${tileSvgElement(tileFace(t.hi, t.lo, { shadow: 'flat' }), 92, { extraClass: 'lot-tile' })}
        <span>${esc(name)} — ${pipSum(lot.tiles[seat])}</span>
      </div>`;
    };
    $('#lot-row').innerHTML = `${side(0, n0)}${side(1, n1)}`;
    $('#lot-result').innerHTML = T().lotWinner(`<b>${esc(lotFirst === 0 ? n0 : n1)}</b>`);
    $<HTMLButtonElement>('#btn-start').disabled = false;
  }

  function startNewMatch(): void {
    const curExtra = extraOpponents.find((o) => o.id === opponentPref);
    if (lotFirst === null && curExtra?.needsLots !== false) return;
    const n0 = $<HTMLInputElement>('#inp-n0').value.trim() || T().defaultP1;
    const n1 = secondName();
    const variant = view.variantFrom(elOverlay);
    const opp = opponentPref;
    const botLevel = botLevels.find((lv) => lv === opp) ?? null;
    if (opp !== 'human' && botLevel === null) {
      // Дополнительный пункт селектора: матч запускает надстройка.
      opts.onOpponentStart?.(opp, { names: [n0, n1], first: lotFirst ?? 0, variant });
      return;
    }
    // Человек и бот — всегда со жребием: без него до этой строки не дойти.
    const first = lotFirst!;
    const bot = botLevel ? { player: 1 as const, level: botLevel } : null;
    remoteSeat = null;
    opts.onMatchReset?.();
    beginRound(startMatch(engine, { names: [n0, n1], first, variant, bot }), {
      toast: (m) => T().toastFirstOpen(m.names[first]),
    });
  }

  /**
   * Общий вход в раунд — новый или продолженный из сейва — после того, как
   * match уже подменён: сброс выбора и черновика, новая раскладка кучи,
   * кадр, сохранение, перерисовка. Ключ хода сбрасывается всегда: seed
   * рематча приходит извне и может повториться. resume — раунд
   * продолжается, а не начинается: первый показанный ход не мерить,
   * автомасштаб — по настройке игрока, без звука раздачи. toast — подпись
   * после перерисовки.
   */
  function beginRound(next: Match, o: { resume?: boolean; toast?: (m: Match) => string } = {}): void {
    match = next;
    turnKey = '';
    spoilNextTurn = !!o.resume;
    selected = null;
    pending = null;
    pileRoundKey = -1;
    showRoundOver = next.round.phase === 'over';
    lotFirst = null;
    nextRoundWait = null;
    if (o.resume) board.setAutoFit(autoFitOn, false);
    else enableAutoFit(false);
    persist();
    renderAll();
    if (!o.resume) playShuffle();
    if (o.toast) toast(o.toast(next));
  }

  /** Продолжить сохранённый матч со стартовой карточки. */
  function continueSaved(): void {
    const prev = saved.load();
    if (prev) beginRound(prev, { resume: true });
  }

  /** Следующий раунд матча за этим экраном (бот, игра вдвоём). */
  function startNextRound(): void {
    if (!match) return;
    // Надстройка может взять переход на себя (общий seed сетевой партии).
    if (opts.onNextRoundRequest?.() === true) return;
    beginRound(nextRound(engine, match, seedFromCrypto()), { toast: roundStartToast });
  }

  /** Тост начала очередного раунда. */
  const roundStartToast = (m: Match): string => T().toastRoundStart(m.rounds.length + 1, m.names[m.first]);

  /** Сброс матча: стартовая карточка, сейв стёрт, надстройка извещена. */
  function resetMatch(): void {
    match = null;
    lotFirst = null;
    replay = null;
    pending = null;
    remoteSeat = null;
    nextRoundWait = null;
    store.remove(LS_KEY);
    opts.onMatchReset?.();
    renderAll();
  }

  /**
   * Сброс с подтверждением, если матч не доигран: «дверь» в шапке и
   * «Бросить матч» на карточке итогов — один путь.
   */
  function askResetMatch(): void {
    if (match && !match.outcome && !window.confirm(T().confirmNewMatch)) return;
    resetMatch();
  }

  /** Ответ на разовое предложение убрать подсказки: пометка при любом ответе. */
  function answerTutorOffer(keep: boolean): void {
    tutorAsked = true;
    if (!keep) tutorOn = false;
    persistUi();
    renderAll();
  }

  /** Шаг просмотра истории; значение зажимается в renderReplayView. */
  function seekReplay(next: (step: number) => number): void {
    if (!replay) return;
    replay.step = next(replay.step);
    renderAll();
  }

  function renderRoundOver(match: Match): void {
    const over = view.roundOver(match, nameOf);

    let footer: string;
    const historyBtn = `<button class="btn ghost-btn" data-action="history">${T().btnHistory}</button>`;
    // Действия платформы — тем же рядом во всю ширину, что и на стартовой
    // карточке: пауза между раундами — естественный момент, кнопка пассивна
    // и ничего не запирает.
    const platformRow = platformActionsRow();
    if (over.outcomeTitle !== null) {
      footer = `
        <hr class="sep">
        <h2>${over.outcomeTitle}</h2>
        <div class="btn-row">
          <button class="btn" data-action="new-match">${T().btnNewMatch}</button>
        </div>
        <div class="btn-row">${historyBtn}</div>`;
    } else {
      // Матч с внешним игроком: состояние договора — на самой кнопке.
      // Нажали мы — кнопка гаснет и ждёт соперника; нажал он первым — кнопка
      // активна и зовёт. Без имён — ни рода, ни падежа.
      const nextBtn = nextRoundButton(nextRoundWait, remoteSeat !== null, T());
      const notes = `<span class="result-note">${over.nextNote}</span>`;
      // «Бросить матч» и «История ходов» — одним рядом поровну, под ним
      // действие платформы во всю ширину.
      footer = `
        <div class="btn-row">
          ${nextBtn}
          ${notes}
        </div>
        <div class="btn-row review-row">
          <button class="btn ghost-btn" data-action="abort-match">${T().btnAbortMatch}</button>
          ${historyBtn}
        </div>${platformRow}`;
    }

    // Время раунда и матча — только когда есть честные замеры.
    const times = matchTimes(match.rounds);
    const timeRow = times
      ? `<div class="match-round">${T().resultTime(fmtDuration(times.round), fmtDuration(times.match))}</div>`
      : '';

    // Подсказки нужны первые раунды, дальше только мешают. Предлагаем убрать
    // их один раз и больше не возвращаемся к вопросу, каким бы ни был ответ.
    const tutorOffer =
      tutorOn && !tutorAsked && roundsDone >= TUTOR_ENOUGH
        ? `<hr class="sep">
        <p class="sub">${T().tutorEnough}</p>
        <div class="btn-row">
          <button class="btn" data-action="tutor-off">${T().btnTutorOff}</button>
          <button class="btn ghost-btn" data-action="tutor-keep">${T().btnTutorKeep}</button>
        </div>`
        : '';

    elOverlay.innerHTML = `
      <div class="card">
        <h2>${over.title}</h2>
        <p class="sub">${over.sub}</p>
        <div class="result-grid">${over.rows}</div>
        <div class="match-round">${over.matchLabel}</div>
        ${timeRow}
        <div class="match-score">${esc(nameOf(0))} ${match.totals[0]} : ${match.totals[1]} ${esc(nameOf(1))}</div>
        ${footer}${tutorOffer}
      </div>`;
    elOverlay.hidden = false;
  }

  // --- Добор из базара с полётом кости ------------------------------------------

  function onPileClick(spriteIdx: number, spriteEl: HTMLElement): void {
    if (!match || match.round.phase === 'over') return;
    if (notMyTurn()) {
      toast(T().toastNoDrawNow, true);
      return;
    }
    if (performance.now() - lastDispatchAt < 300) return;
    const round = match.round;
    const legal = engine.legalMoves(round);
    const draw = legal.find((m) => view.moveKind(m) === 'draw');
    if (!draw) {
      elBoneyard.classList.remove('shake');
      void elBoneyard.offsetWidth;
      elBoneyard.classList.add('shake');
      const anyPlacement = legal.some((m) => view.moveKind(m) === 'place');
      toast(anyPlacement ? T().toastNoDrawHaveMove : T().toastNoDrawNow, true);
      return;
    }

    const drawer = round.current;
    const fromRect = spriteEl.getBoundingClientRect();
    // Спрайт гаснет до рендера: кликнутая кость исчезает из кучи, клон летит.
    const sprite = pileSprites[spriteIdx];
    if (sprite) sprite.alive = false;
    dispatch(draw);
    playDraw();
    // Что вытянулось — знает игра по состоянию после хода.
    const tile = view.drawnTile(match.round);
    if (!tile) return;
    // Полёт: рубашка → лицо, из кучи в руку игрока.
    const toEl = handEl(drawer);
    const toRect = toEl.getBoundingClientRect();
    const pt = parseTile(tile);
    const fly = makeFlyingTile([pt.hi, pt.lo]);
    fly.style.left = `${fromRect.left}px`;
    fly.style.top = `${fromRect.top}px`;
    document.body.appendChild(fly);
    const dx = toRect.left + toRect.width / 2 - fromRect.left - 44;
    const dy = toRect.top + toRect.height / 2 - fromRect.top - 22;
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${dx}px, ${dy}px) rotate(360deg) scale(0.9)`;
      fly.style.opacity = '0.15';
    });
    // Скрыть новую кость в руке, пока летит клон.
    const handTile = toEl.querySelector<HTMLElement>(`[data-tile="${tile}"]`);
    handTile?.classList.add('incoming');
    window.setTimeout(() => {
      fly.remove();
      handTile?.classList.remove('incoming');
    }, 430);
  }

  // --- Ход перетягиванием кости из руки -----------------------------------------
  // Дополнение к ходу тапом: кость ведут пальцем от руки к столу. У тени она
  // встаёт на ближайший вариант позиции, движение пальца меняет вариант или
  // уводит кость прочь; ставит её отпускание пальца. Отпущенная мимо теней
  // кость возвращается на своё место в руке. Логика жеста — drag-snap.ts.

  function wiggle(el: HTMLElement): void {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  function handTileEl(player: Seat, tile: TileId): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.hand-tile[data-player="${player}"][data-tile="${tile}"]`);
  }

  function placeDragClone(d: TileDrag<M>, clone: HTMLElement, pose: ScreenPose, snapped: boolean): void {
    d.angle = nearestAngle(d.angle, pose.angle);
    clone.classList.toggle('snapped', snapped);
    clone.style.transform =
      `translate(${(pose.x - FLY_PX / 2).toFixed(1)}px, ${(pose.y - FLY_PX / 4).toFixed(1)}px) ` +
      `rotate(${d.angle.toFixed(1)}deg) scale(${(pose.scale / FLY_PX).toFixed(3)})`;
  }

  /** Есть ли у кости ход-выкладывание. */
  function canPlace(round: S, tile: TileId): boolean {
    return engine
      .legalMoves(round)
      .some((m) => view.moveKind(m) === 'place' && view.moveTile(m, round) === tile);
  }

  /** Порог пройден: кость берётся из руки. false — брать нечего или нельзя. */
  function beginDrag(d: TileDrag<M>): boolean {
    const el = handTileEl(d.player, d.tile);
    if (!el || replay || !match || match.round.phase === 'over' || notMyTurn()) return false;
    const round = match.round;
    // Обязательная кость (после добора) отсекается тем же условием:
    // легальные ходы есть только у неё.
    if (!canPlace(round, d.tile)) {
      // Кости некуда встать — то же покачивание, что и на тап.
      wiggle(el);
      return false;
    }
    const t = parseTile(d.tile);
    const clone = makeFlyingTile([t.hi, t.lo], 'drag-tile');
    clone.style.left = '0';
    clone.style.top = '0';
    placeDragClone(d, clone, handPose(el.getBoundingClientRect()), false);
    document.body.appendChild(clone);
    d.clone = clone;
    // Захват — на контейнере руки: сама кость перерисовывается рендером,
    // а события пальца должны приходить до самого отпускания.
    try {
      handEl(d.player).setPointerCapture(d.pointerId);
    } catch {
      /* указатель уже отпущен — обойдёмся без захвата */
    }
    selected = d.tile;
    pending = null;
    dragHidden = { player: d.player, tile: d.tile };
    renderAll();
    // Как и при выборе тапом: место хода — в кадре.
    if (view.refitOnPick?.(round)) enableAutoFit();
    return true;
  }

  /** Кость идёт за пальцем и прилипает к ближайшей тени в радиусе. */
  function moveDrag(d: TileDrag<M>, clone: HTMLElement, px: number, py: number): void {
    // Жест жив только при идущем раунде: потерявший смысл бросает dropStaleDrag.
    const round = match!.round;
    // Палец закрывает кость: держим её со стороны стола от пальца.
    const lift = !d.touch ? 0 : d.player === bottomSeat() ? -DRAG_LIFT_PX : DRAG_LIFT_PX;
    const probe = { x: px, y: py + lift };
    const targets = board.ghostTargets();
    const radius = Math.max(SNAP_MIN_PX, targets[0]?.pose.scale ?? 0);
    const snap = pickSnap(
      probe,
      targets.map((g) => ({ x: g.x, y: g.y, item: g.move })),
      radius,
      d.snap,
      (a, b) => view.samePlacement(a, b),
    );
    const changed = snap === null ? d.snap !== null : d.snap === null || !view.samePlacement(snap, d.snap);
    const target = snap && targets.find((g) => g.move === snap);
    if (changed) {
      d.snap = snap;
      renderBoard(round, engine.legalMoves(round));
    }
    if (!target) {
      placeDragClone(d, clone, { ...probe, angle: 90, scale: FLY_PX }, false);
      return;
    }
    // Клон несёт кость как в руке (старшее число первым); тень может лежать
    // наоборот — тогда клон довёрнут на пол-оборота.
    const t = parseTile(d.tile);
    const flip = target.values[0] !== t.hi ? 180 : 0;
    placeDragClone(d, clone, { ...target.pose, angle: target.pose.angle + flip }, true);
  }

  /** Палец отпущен (или жест отменён системой). */
  function endDrag(d: TileDrag<M>, cancelled: boolean): void {
    drag = null;
    const clone = d.clone;
    if (!clone) return; // нажатие без движения — это тап, его ведёт click
    swallowClick = true;
    const snap = cancelled ? null : d.snap;
    if (!snap) {
      // Мимо теней: кость улетает назад на своё место в руке.
      const hidden = dragHidden;
      renderAll();
      const home = handTileEl(d.player, d.tile);
      if (home) {
        clone.classList.add('returning');
        placeDragClone(d, clone, handPose(home.getBoundingClientRect()), false);
      }
      window.setTimeout(() => {
        clone.remove();
        if (dragHidden === hidden) {
          dragHidden = null;
          handTileEl(d.player, d.tile)?.classList.remove('incoming');
        }
      }, DRAG_RETURN_MS);
      return;
    }
    clone.remove();
    dragHidden = null;
    if (confirmOn) {
      // Подтверждение ходов действует как при тапе по тени: отпущенная
      // кость становится черновиком и ждёт подтверждения.
      pending = snap;
      pendingAt = performance.now();
      renderAll();
      return;
    }
    const target = board.ghostTargets().find((g) => view.samePlacement(g.move, snap));
    dispatch(snap, false, target?.pose);
  }

  /** Перетягивание потеряло смысл (чужой ход, история, сброс матча) — бросаем. */
  function dropStaleDrag(): void {
    if (!drag?.clone) return;
    const live =
      !replay &&
      !!match &&
      match.round.phase !== 'over' &&
      !notMyTurn() &&
      match.round.current === drag.player &&
      match.round.hands[drag.player].includes(drag.tile);
    if (live) return;
    drag.clone.remove();
    drag = null;
    dragHidden = null;
  }

  document.addEventListener('pointerdown', (ev) => {
    swallowClick = false;
    if (drag || ev.button !== 0) return;
    const el = (ev.target as Element).closest<HTMLElement>('.hand-tile[data-tile]');
    if (!el || replay || !match || match.round.phase === 'over') return;
    const player = Number(el.dataset.player) as Seat;
    if (player !== match.round.current || notMyTurn()) return;
    drag = {
      pointerId: ev.pointerId,
      tile: el.dataset.tile as TileId,
      player,
      touch: ev.pointerType === 'touch' || ev.pointerType === 'pen',
      startX: ev.clientX,
      startY: ev.clientY,
      clone: null,
      snap: null,
      angle: 90,
    };
  });
  document.addEventListener('pointermove', (ev) => {
    const d = drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    if (!d.clone) {
      const intent = dragIntent(ev.clientX - d.startX, ev.clientY - d.startY, d.touch);
      if (intent === 'none') return;
      // Вдоль ряда — прокрутка руки, её ведёт сам браузер.
      if (intent === 'scroll' || !beginDrag(d)) {
        drag = null;
        return;
      }
    }
    if (d.clone) moveDrag(d, d.clone, ev.clientX, ev.clientY);
  });
  document.addEventListener('pointerup', (ev) => {
    const d = drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    if (d.clone) moveDrag(d, d.clone, ev.clientX, ev.clientY);
    endDrag(d, false);
  });
  document.addEventListener('pointercancel', (ev) => {
    if (drag && ev.pointerId === drag.pointerId) endDrag(drag, true);
  });
  // Раньше остальных обработчиков кликов: отпускание перетянутой кости
  // не должно стать ни выбором кости, ни ходом по тени, ни добором.
  document.addEventListener(
    'click',
    (ev) => {
      if (!swallowClick) return;
      swallowClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    },
    true,
  );

  // --- События -------------------------------------------------------------------

  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;

    // Внешние ссылки: надстройка может открывать их по-своему
    // (например, системным браузером вместо вкладки WebView).
    const ext = target.closest<HTMLAnchorElement>('a[target="_blank"]');
    if (ext && opts.openExternal) {
      ev.preventDefault();
      opts.openExternal(ext.href);
      return;
    }

    const pile = target.closest<HTMLElement>('[data-pile]');
    if (pile) {
      if (!replay) onPileClick(Number(pile.dataset.pile), pile);
      return;
    }

    // Мимо кости, но в границах кучи: при малом базаре между спрайтами
    // зияют просветы, и добор срабатывал бы через раз. Улетает ближайшая к
    // пальцу кость; какая выдана — по-прежнему решает движок. Ход по тени,
    // кнопка, кость в руке и открытый оверлей важнее кучи. Панель
    // подтверждения — тоже: на телефоне она лежит в границах зоны.
    if (
      !replay &&
      elOverlay.hidden &&
      !target.closest('[data-move],[data-action],[data-tile],#confirm-bar')
    ) {
      const zone = pileZone(elBoneyard, pileSprites);
      if (zone && ev.clientX >= zone.l && ev.clientX <= zone.r && ev.clientY >= zone.t && ev.clientY <= zone.b) {
        const near = nearestPileSprite(elBoneyard, ev.clientX, ev.clientY);
        if (near) {
          onPileClick(near.idx, near.el);
          return;
        }
      }
    }

    const handTile = target.closest<HTMLElement>('[data-tile]');
    if (handTile && !replay && match && match.round.phase !== 'over') {
      const tile = handTile.dataset.tile as TileId;
      const player = Number(handTile.dataset.player) as Seat;
      const round = match.round;
      if (player !== round.current || notMyTurn()) return;
      const forced = view.forcedTile(round);
      if (forced && tile !== forced) {
        toast(view.forcedToast(round), true);
        return;
      }
      if (!tilesOf(round, engine.legalMoves(round)).has(tile)) {
        wiggle(handTile);
        return;
      }
      selected = selected === tile && !forced ? null : tile;
      renderAll();
      // Место хода выбранной кости — в кадре, даже если стол смещали раньше.
      if (selected && view.refitOnPick?.(round)) enableAutoFit();
      return;
    }

    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action!;
    if (action.startsWith('x-act:')) {
      // Пункт-действие платформы на стартовой карточке и итогах: та же
      // цель, что у строки в настройках; карточка остаётся на месте.
      extraActions.find((a) => a.id === action.slice(6))?.onSelect();
      return;
    }
    if (Object.hasOwn(actions, action)) actions[action]!();
  });

  /** Действия кнопок карточек и панелей по data-action (клик по документу). */
  const actions: Record<string, () => void> = {
    lot: rollLot,
    start: startNewMatch,
    continue: continueSaved,
    'next-round': startNextRound,
    // Карточка итогов перекрывает шапку целиком, и «дверь» из неё не
    // достать — то же действие с тем же подтверждением.
    'abort-match': askResetMatch,
    'new-match': resetMatch,
    howto: () => view.openHowTo({ onClose: markHowtoShown }),
    'settings-open': () => openSettings(true),
    'tutor-off': () => answerTutorOffer(false),
    'tutor-keep': () => answerTutorOffer(true),
    history: () => {
      showRoundOver = false;
      openHistory();
    },
    'replay-exit': exitReplay,
    'replay-first': () => seekReplay(() => 0),
    'replay-prev': () => seekReplay((s) => Math.max(0, s - 1)),
    'replay-next': () => seekReplay((s) => s + 1),
    'replay-last': () => seekReplay(() => Number.MAX_SAFE_INTEGER),
  };

  // Приложение ушло с глаз (сворачивание, блокировка, внешний браузер) —
  // текущий замер времени хода испорчен.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) turnStartedAt = null;
  });
  // WebView и бфкэш могут усыпить страницу и без visibilitychange.
  window.addEventListener('pagehide', () => {
    turnStartedAt = null;
  });
  document.addEventListener('freeze', () => {
    turnStartedAt = null;
  });

  // Ползунок (replay-slider) панели истории.
  document.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'replay-slider' && replay) {
      replay.step = Number(t.value);
      renderAll();
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'replay-round' && replay) {
      replay.roundIdx = Number(t.value);
      replay.step = 0;
      renderAll();
    } else if (t.id === 'inp-n0' || t.id === 'inp-n1') {
      // Имена запоминаются между запусками. Поле второго имени существует
      // только в матче с человеком — имя бота нередактируемо.
      const v = t.value.trim().slice(0, 16);
      if (t.id === 'inp-n0') savedP1 = v;
      else savedP2 = v;
      persistUi();
    } else if (t.id === 'inp-lang-start') {
      // Введённые, но ещё не сохранённые имена не теряем; автоподстановки
      // старого языка не переносим — новые придут с перерисовкой экрана.
      const n0 = document.querySelector<HTMLInputElement>('#inp-n0')?.value.trim();
      if (n0 && n0 !== T().defaultP1) savedP1 = n0;
      const n1 = document.querySelector<HTMLInputElement>('#inp-n1')?.value.trim();
      if (n1 && n1 !== T().defaultP2) savedP2 = n1;
      const kept = (view.keepFields ?? []).map(
        (sel) => [sel, document.querySelector<HTMLInputElement>(sel)?.checked] as const,
      );
      i18n.setLocale(t.value);
      persistUi();
      applyStaticTexts();
      renderStartScreen();
      // Второго рендера здесь быть не должно: renderAll без матча строил бы
      // карточку заново и затирал восстановленные галочки.
      for (const [sel, on] of kept) {
        const el = document.querySelector<HTMLInputElement>(sel);
        if (el && on !== undefined) el.checked = on;
      }
    } else if (t.id === 'inp-opp') {
      opponentPref = t.value as OpponentPref;
      persistUi();
      // Форма зависит от пункта (жребий, второе имя) — перестраиваем экран,
      // сохранив введённое имя первого игрока и галочки игры. Поле второго
      // имени появляется и исчезает вместе с пунктом; перерисовка сама
      // подставит сохранённое имя или имя по умолчанию.
      const n0 = document.querySelector<HTMLInputElement>('#inp-n0')?.value;
      rerenderStartScreen();
      const n0el = document.querySelector<HTMLInputElement>('#inp-n0');
      if (n0el && n0 !== undefined) n0el.value = n0;
    } else if (view.startFieldChange?.(t)) {
      persistUi();
    }
  });

  elBtnHist.addEventListener('click', () => {
    if (replay) exitReplay();
    else openHistory();
  });

  /** Включить автомасштаб программно (новый раунд, выбор кости с местом вне кадра). */
  function enableAutoFit(animate = true): void {
    autoFitOn = true;
    persistUi();
    board.setAutoFit(true, animate);
    elBtnFit.classList.add('active');
  }

  // Кнопка «автомасштаб»: включена — держим всё содержимое стола в кадре.
  elBtnFit.addEventListener('click', () => {
    autoFitOn = !autoFitOn;
    board.setAutoFit(autoFitOn);
    elBtnFit.classList.toggle('active', autoFitOn);
    persistUi();
  });

  // --- Экран настроек ---------------------------------------------------------
  // Настройки, которые ставят один раз, собраны в одном месте с подписями:
  // безымянные значки в шапке не объяснить, а на телефоне и подсказку по
  // наведению не показать.

  const elSettings = document.createElement('div');
  elSettings.id = 'settings';
  elSettings.hidden = true;
  document.body.appendChild(elSettings);

  function renderSettings(): void {
    const row = (id: string, on: boolean, text: string): string =>
      `<label class="check"><input data-set="${id}" type="checkbox" ${on ? 'checked' : ''}>${text}</label>`;
    elSettings.innerHTML = `
      <div class="card" style="max-width:460px;width:100%">
        <h1 style="font-size:22px">${T().settingsTitle}</h1>
        <div class="field"><label for="set-lang">${T().fieldLang}</label>
          <select id="set-lang" class="lang-select">${localeOptionsHtml()}</select></div>
        <hr class="sep">
        ${row('sound', soundOn, T().tipSound)}
        ${row('tutor', tutorOn, T().tipTutor)}
        ${row('confirm', confirmOn, T().tipConfirm)}
        ${(view.settings?.() ?? []).map((s) => row(s.id, s.on, s.text)).join('')}
        ${extraToggles.map((t) => row(`x:${t.id}`, toggleState.get(t.id) === true, esc(t.label()))).join('')}
        ${extraActions
          .map(
            (a) =>
              `<p class="sub action-line"><a href="#" data-action="x-act:${esc(a.id)}">${esc(a.label())}</a></p>`,
          )
          .join('')}
        ${
          opts.privacyUrl
            ? `<p class="sub privacy-line"><a href="${opts.privacyUrl}" target="_blank" rel="noopener">${T().linkPrivacy}</a></p>`
            : ''
        }
        <div class="btn-row"><button class="btn" data-action="settings-close">${T().btnDone}</button></div>
      </div>`;
  }

  function openSettings(on: boolean): void {
    if (on) renderSettings();
    elSettings.hidden = !on;
  }

  elSettings.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    if (el.id === 'set-lang') {
      i18n.setLocale(el.value);
      persistUi();
      applyStaticTexts();
      renderSettings();
      renderAll();
      return;
    }
    const id = (el as HTMLInputElement).dataset.set;
    if (!id) return;
    const on = (el as HTMLInputElement).checked;
    if (id.startsWith('x:')) {
      const toggle = extraToggles.find((t) => t.id === id.slice(2));
      if (!toggle) return;
      toggleState.set(toggle.id, on);
      persistUi();
      toggle.onChange(on);
      return;
    }
    if (id === 'sound') {
      soundOn = on;
      setSoundEnabled(on);
      if (on) playPlace('normal');
    } else if (id === 'tutor') {
      tutorOn = on;
    } else if (id === 'confirm') {
      confirmOn = on;
      if (!on) pending = null;
    } else {
      // Строка игры: её id не совпадает с общими и не начинается с «x:».
      view.setSetting?.(id, on);
    }
    persistUi();
    renderAll();
  });

  elSettings.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el?.dataset.action) return;
    if (el.dataset.action === 'settings-close') openSettings(false);
    if (el.dataset.action.startsWith('x-act:')) {
      ev.preventDefault();
      // Общий обработчик документа тоже понимает x-act (кнопка на карточке
      // и на итогах) — без остановки всплытия надстройку звали бы дважды.
      ev.stopPropagation();
      const act = extraActions.find((a) => a.id === el.dataset.action?.slice(6));
      if (!act) return;
      openSettings(false);
      act.onSelect();
    }
  });

  elBtnSettings.addEventListener('click', () => openSettings(elSettings.hidden));

  elBtnNew.addEventListener('click', askResetMatch);

  /** Локализуемые статические элементы: подсказки кнопок, бейдж версии. */
  function applyStaticTexts(): void {
    elBtnHist.dataset.tip = T().tipHistory;
    elBtnFit.dataset.tip = T().tipFit;
    elBtnNew.dataset.tip = T().tipNew;
    elBtnSettings.dataset.tip = T().settingsTitle;
    view.staticTexts?.();
    updateBadge();
  }

  // --- Старт -----------------------------------------------------------------------

  applyStaticTexts();
  elBtnFit.classList.toggle('active', autoFitOn);
  board.setAutoFit(autoFitOn, false);

  try {
    renderAll();
  } catch (err) {
    // Последний рубеж: повреждённое сохранение или иная ошибка первого рендера
    // не должны оставлять пустой экран.
    console.error(err);
    match = null;
    try {
      store.remove(LS_KEY);
    } catch {
      /* хранилище недоступно */
    }
    renderAll();
  }

  // Первый запуск после установки: поверх стартовой карточки — вопрос
  // «Показать, как играть?», слайды только по согласию. Любой ответ ставит
  // флаг; если приложение убьют с открытым вопросом — спросим снова.
  if (!howtoShown && !match) {
    view.openHowToAsk({
      onShow: () => {
        markHowtoShown();
        view.openHowTo({});
      },
      onLater: markHowtoShown,
    });
  }

  return {
    // Внешний ход важнее просмотра истории: иначе ход, пришедший при
    // открытой истории, молча терялся бы.
    dispatch: (m) => {
      if (replay) exitReplay();
      dispatch(m, true);
    },
    getMatch: () => match,
    setRemoteSeat(seat) {
      remoteSeat = seat;
      renderAll();
    },
    startRemoteMatch(o) {
      remoteSeat = o.remoteSeat;
      beginRound(
        startMatch(engine, { names: o.names, first: o.first, variant: o.variant, seed: o.seed, bot: null }),
        { toast: (m) => T().toastFirstOpen(m.names[o.first]) },
      );
    },
    nextRoundWith(seed) {
      if (!match || match.outcome) return;
      beginRound(nextRound(engine, match, seed), { toast: roundStartToast });
    },
    setNextRoundWait(state) {
      nextRoundWait = state;
      renderAll();
    },
    render: renderAll,
  };
}
