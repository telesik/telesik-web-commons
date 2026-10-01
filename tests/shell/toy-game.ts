// Игрушечная игра для тестов каркаса: «линия». Кости кладутся в одну цепочку
// к её открытому концу; нечем ходить — добор одной кости (подошла — обязан
// сыграть ею), базар пуст — пас; раунд кончается выходом или двумя пасами.
// Движок, виды и стол — по контрактам каркаса. Не тест — общий помощник.
import type { GameEngine, RoundCore, Seat } from '../../src/engine';
import type { MatchState } from '../../src/match';
import { shuffle } from '../../src/rng';
import type {
  BoardFactory,
  BoardHooks,
  BoardRenderOptions,
  GameView,
  GhostTarget,
  ScreenPose,
  ShellApi,
} from '../../src/shell/types';
import { tileBack } from '../../src/tile-svg';
import { fullSet, hasValue, parseTile, pipSum, type TileId } from '../../src/tiles';

export type LineMove =
  /** side — вариант раскладки, правилам безразличен. */
  | { readonly type: 'place'; readonly tile: TileId; readonly side?: 0 | 1; readonly t?: number }
  | { readonly type: 'draw'; readonly t?: number }
  | { readonly type: 'pass'; readonly t?: number };

export interface LineVariant {
  /** Костей на руку. */
  readonly hand: number;
  /** Раундов в матче. */
  readonly rounds: number;
  /** Рука соперника закрыта. */
  readonly hidden?: boolean;
}

export interface LineResult {
  readonly cause: 'out' | 'blocked';
  readonly sums: readonly [number, number];
  readonly added: readonly [number, number];
  readonly winner: Seat | null;
}

export type LineLog =
  | { readonly kind: 'place'; readonly player: Seat; readonly tile: TileId }
  | { readonly kind: 'draw'; readonly player: Seat; readonly tile: TileId }
  | { readonly kind: 'pass'; readonly player: Seat }
  | { readonly kind: 'end'; readonly cause: 'out' | 'blocked' };

export interface LinePlaced {
  readonly tile: TileId;
  readonly values: readonly [number, number];
  readonly seq: number;
}

export interface LineState extends RoundCore<LineMove, LineResult, LineLog> {
  readonly phase: 'play' | 'over';
  readonly placed: readonly LinePlaced[];
  /** Открытый конец цепочки; null — стол пуст. */
  readonly end: number | null;
  /** Вытянутая кость, которой игрок обязан сходить. */
  readonly forced: TileId | null;
  readonly passStreak: number;
  readonly variant: LineVariant;
}

export type LineOutcome = { readonly kind: 'win'; readonly winner: Seat } | { readonly kind: 'draw' };
export type LineMatch = MatchState<LineState, LineMove, LineVariant, LineResult, LineOutcome>;

/** Костей в базаре после раздачи. */
export const PILE = 4;
export const BASE: LineVariant = { hand: 3, rounds: 2 };

const other = (p: Seat): Seat => (1 - p) as Seat;
const fits = (s: LineState, t: TileId): boolean => s.end === null || hasValue(t, s.end);

function finish(s: LineState, cause: 'out' | 'blocked'): LineState {
  const sums: [number, number] = [
    s.hands[0].reduce((a, t) => a + pipSum(t), 0),
    s.hands[1].reduce((a, t) => a + pipSum(t), 0),
  ];
  const winner = sums[0] < sums[1] ? 0 : sums[1] < sums[0] ? 1 : null;
  // Очки получает проигравший раунд: свою сумму. Поровну — оба.
  const added: [number, number] = winner === null ? sums : winner === 0 ? [0, sums[1]] : [sums[0], 0];
  return {
    ...s,
    phase: 'over',
    result: { cause, sums, added, winner },
    log: [...s.log, { kind: 'end', cause }],
  };
}

export const lineEngine: GameEngine<LineState, LineMove, LineVariant, LineResult, LineLog, LineOutcome> = {
  id: 'line',
  rulesVersion: '0.1',
  defaultVariant: BASE,
  canonVariant: (v) => ({ hand: v.hand, rounds: v.rounds, ...(v.hidden ? { hidden: true } : {}) }),
  sameVariant: (a, b) => a.hand === b.hand && a.rounds === b.rounds && !!a.hidden === !!b.hidden,
  newRound({ seed, first, variant }) {
    const [deck] = shuffle(fullSet(), seed);
    const hands: [TileId[], TileId[]] = [[], []];
    hands[first] = deck.slice(0, variant.hand);
    hands[other(first)] = deck.slice(variant.hand, variant.hand * 2);
    return {
      phase: 'play',
      current: first,
      first,
      seed,
      history: [],
      result: null,
      log: [],
      hands,
      boneyard: deck.slice(variant.hand * 2, variant.hand * 2 + PILE),
      placed: [],
      end: null,
      forced: null,
      passStreak: 0,
      variant,
    };
  },
  legalMoves(s) {
    if (s.phase === 'over') return [];
    const hand = s.hands[s.current];
    const tiles = s.forced ? [s.forced] : hand.filter((t) => fits(s, t));
    if (tiles.length > 0) return tiles.map((tile) => ({ type: 'place', tile }));
    return s.boneyard.length > 0 ? [{ type: 'draw' }] : [{ type: 'pass' }];
  },
  applyMove(s, m) {
    const legal = this.legalMoves(s);
    if (!legal.some((x) => this.moveEquals(x, m))) throw new Error('Нелегальный ход');
    const history = [...s.history, m];
    const p = s.current;
    if (m.type === 'place') {
      const { hi, lo } = parseTile(m.tile);
      const values: readonly [number, number] = s.end === null || hi === s.end ? [hi, lo] : [lo, hi];
      const hand = s.hands[p].filter((t) => t !== m.tile);
      const hands: [readonly TileId[], readonly TileId[]] = p === 0 ? [hand, s.hands[1]] : [s.hands[0], hand];
      const next: LineState = {
        ...s,
        history,
        hands,
        placed: [...s.placed, { tile: m.tile, values, seq: s.placed.length }],
        end: values[1],
        forced: null,
        passStreak: 0,
        log: [...s.log, { kind: 'place', player: p, tile: m.tile }],
        current: other(p),
      };
      return hand.length === 0 ? finish(next, 'out') : next;
    }
    if (m.type === 'draw') {
      const tile = s.boneyard[0]!;
      const hand = [...s.hands[p], tile];
      const hands: [readonly TileId[], readonly TileId[]] = p === 0 ? [hand, s.hands[1]] : [s.hands[0], hand];
      const playable = fits(s, tile);
      return {
        ...s,
        history,
        hands,
        boneyard: s.boneyard.slice(1),
        forced: playable ? tile : null,
        current: playable ? p : other(p),
        log: [...s.log, { kind: 'draw', player: p, tile }],
      };
    }
    const next: LineState = {
      ...s,
      history,
      passStreak: s.passStreak + 1,
      current: other(p),
      log: [...s.log, { kind: 'pass', player: p }],
    };
    return next.passStreak >= 2 ? finish(next, 'blocked') : next;
  },
  moveEquals: (a, b) => a.type === b.type && (a.type !== 'place' || a.tile === (b as typeof a).tile),
  matchOutcome(totals, rounds, variant) {
    if (rounds < variant.rounds) return null;
    return totals[0] === totals[1]
      ? { kind: 'draw' }
      : { kind: 'win', winner: totals[0] < totals[1] ? 0 : 1 };
  },
  nextFirst: (last) => last.winner ?? other(last.first),
  chooseBotMove: (s) => lineEngine.legalMoves(s)[0]!,
};

/** Та же игра без бота: каркас не предлагает уровни. */
export const lineEngineNoBot: typeof lineEngine = { ...lineEngine, chooseBotMove: undefined };

/** Записанные вызовы видов — для проверок в тестах. */
export interface ViewSpy {
  howto: { onClose?: () => void }[];
  howtoAsk: { onShow: () => void; onLater: () => void }[];
  renders: ({ round: LineState; remote: boolean } | null)[];
  staticTexts: number;
  api: ShellApi<LineState, LineMove, LineVariant, LineResult, LineOutcome> | null;
  /** Игровые настройки вида. */
  prefs: { wide: boolean; hand: number };
}

export interface ViewConfig {
  readonly hotSeat?: boolean;
  /** Игровые настройки в корне сохранённых настроек (исторический формат). */
  readonly prefsFlat?: boolean;
  /** Только обязательные члены контракта: без необязательных ручек. */
  readonly bare?: boolean;
}

type LineView = GameView<LineState, LineMove, LineVariant, LineResult, LineLog, LineOutcome>;

export function makeView(cfg: ViewConfig = {}): { view: LineView; spy: ViewSpy } {
  const spy: ViewSpy = {
    howto: [],
    howtoAsk: [],
    renders: [],
    staticTexts: 0,
    api: null,
    prefs: { wide: false, hand: BASE.hand },
  };
  const label = (t: TileId): string => t.replace('-', ':');
  const base: LineView = {
    logo: (size, cls) => `<svg class="logo ${cls}" height="${size}"></svg>`,
    titleHtml: () => '<span>Линия</span>',
    rulesUrl: () => 'https://example.org/rules',
    tileBack: (o) => tileBack({ ...o, emblem: '<g class="emblem"></g>' }),
    openHowTo: (o) => void spy.howto.push(o),
    openHowToAsk: (o) => void spy.howtoAsk.push(o),
    hotSeat: cfg.hotSeat ?? true,
    pileSize: PILE,

    moveKind: (m) => m.type,
    moveTile: (m) => (m.type === 'place' ? m.tile : null),
    placedSeqOf: (m, after) => (m.type === 'place' ? after.placed.length - 1 : null),
    placedValues: (s, seq) => s.placed[seq]!.values,
    placeSound: (_m, after) => (after.placed.length === 1 ? 'accent' : 'normal'),
    samePlacement: (a, b) =>
      a.type === 'place' && b.type === 'place' && a.tile === b.tile && (a.side ?? 0) === (b.side ?? 0),
    // Дубль показывается двумя тенями — двумя вариантами раскладки.
    ghostMoves: (_s, legal, selected) =>
      legal
        .filter((m) => m.type === 'place' && m.tile === selected)
        .flatMap((m) => {
          const t = parseTile((m as { tile: TileId }).tile);
          return t.hi === t.lo ? [{ ...m, side: 0 as const }, { ...m, side: 1 as const }] : [m];
        }),
    forcedTile: (s) => s.forced,
    forcedToast: (s) => `Обязаны сходить ${label(s.forced!)}`,
    drawnTile(s) {
      const e = s.log[s.log.length - 1];
      return e && e.kind === 'draw' ? e.tile : null;
    },

    logSeat: (e) => ('player' in e ? e.player : null),
    describeLog(e, names, viewer) {
      switch (e.kind) {
        case 'place':
          return `${names[e.player]}: ${label(e.tile)}`;
        case 'draw':
          // Чужую вытянутую кость не называем.
          return viewer === 'all' || viewer === e.player
            ? `${names[e.player]}: добор ${label(e.tile)}`
            : `${names[e.player]}: добор`;
        case 'pass':
          return `${names[e.player]}: пас`;
        case 'end':
          return e.cause === 'out' ? 'Выход' : 'Блок';
      }
    },
    prompt: (s, ctx) =>
      s.forced
        ? `${ctx.nameHtml}: сыграйте ${label(s.forced)}`
        : ctx.legal.some((m) => m.type === 'place')
          ? `${ctx.nameHtml}: ваш ход`
          : `${ctx.nameHtml}: берите из базара`,
    tutor: (_s, ctx) => (ctx.selected ? `Выбрана ${label(ctx.selected)}` : 'Выберите кость'),
    tutorOver: () => 'Раунд окончен',
    confirmQuestion: (m) => (m.type === 'place' ? `Поставить ${label(m.tile)}?` : ''),

    handHidden: (s, seat, bottom) => !!s.variant.hidden && seat !== bottom,
    handMeta: (s, seat, hidden) =>
      hidden ? `костей: ${s.hands[seat].length}` : `костей: ${s.hands[seat].length}, очков: ${s.hands[seat].reduce((a, t) => a + pipSum(t), 0)}`,
    totalChip: (match, seat) => `<span class="total-chip">${match.totals[seat]}</span>`,
    roundOver: (match, nameOf) => {
      const r = match.round.result!;
      return {
        title: r.cause === 'out' ? 'Выход' : 'Блок',
        sub: r.winner === null ? 'Поровну' : `Победил ${nameOf(r.winner)}`,
        rows: ([0, 1] as const).map((p) => `<div class="result-name">${nameOf(p)} +${r.added[p]}</div>`).join(''),
        matchLabel: `Раунд ${match.rounds.length} из ${match.variant.rounds}`,
        outcomeTitle: !match.outcome
          ? null
          : match.outcome.kind === 'draw'
            ? 'Ничья'
            : `Матч выиграл ${nameOf(match.outcome.winner)}`,
        nextNote: 'Дальше начинает победитель',
      };
    },
    roundSummary: (res, i) => `Раунд ${i + 1}: ${res.sums[0]}:${res.sums[1]}`,

    startFields: () =>
      `<label class="check"><input type="radio" name="line-hand" value="3" ${spy.prefs.hand === 3 ? 'checked' : ''}>3</label>
       <label class="check"><input type="radio" name="line-hand" value="5" ${spy.prefs.hand === 5 ? 'checked' : ''}>5</label>
       <label class="check"><input id="inp-hidden" type="checkbox">закрытые руки</label>`,
    variantFrom: (card) => ({
      hand: spy.prefs.hand,
      rounds: BASE.rounds,
      ...(card.querySelector<HTMLInputElement>('#inp-hidden')?.checked ? { hidden: true } : {}),
    }),
    validateSaved(raw) {
      const m = raw as LineMatch | undefined;
      return m && Array.isArray(m.names) && m.round && Array.isArray(m.round.hands) ? m : null;
    },

    prefsFlat: cfg.prefsFlat,
    loadPrefs(raw) {
      spy.prefs.wide = !!raw.wide;
      if (raw.hand === 3 || raw.hand === 5) spy.prefs.hand = raw.hand;
    },
    dumpPrefs: () => ({ wide: spy.prefs.wide, hand: spy.prefs.hand }),
  };
  if (cfg.bare) return { view: base, spy };
  const full: LineView = {
    ...base,
    refitOnPick: (s) => s.placed.length === 0,
    startFieldChange(el) {
      if (el.name !== 'line-hand') return false;
      spy.prefs.hand = Number(el.value);
      return true;
    },
    keepFields: ['#inp-hidden'],
    boardFlags: () => ({ wide: spy.prefs.wide }),
    settings: () => [{ id: 'wide', on: spy.prefs.wide, text: 'Широкий стол' }],
    setSetting(id, on) {
      if (id === 'wide') spy.prefs.wide = on;
    },
    mount(api) {
      spy.api = api;
    },
    onRender: (live) => void spy.renders.push(live),
    staticTexts: () => void spy.staticTexts++,
  };
  return { view: full, spy };
}

/** Стол-заглушка: рисует кости и тени в svg, запоминает вызовы. */
export interface ToyBoard {
  readonly factory: BoardFactory<LineState, LineMove>;
  hooks: BoardHooks<LineMove> | null;
  renders: { state: LineState; opts: BoardRenderOptions<LineMove> }[];
  ensured: number[];
  autoFit: boolean;
  /** Позы теней на экране; пусто — стол «не свёрстан». */
  ghostPose: (index: number) => ScreenPose;
  /** Поза выложенной кости; null — стол «не свёрстан». */
  placedPose: ScreenPose | null;
  /** Тени лежат «наоборот» (младшим числом вперёд) — клон кости довернётся. */
  reversed: boolean;
  /** Стол не отдаёт теней (ещё не свёрстан). */
  noTargets: boolean;
}

export function makeBoard(): ToyBoard {
  const toy: ToyBoard = {
    hooks: null,
    renders: [],
    ensured: [],
    autoFit: true,
    ghostPose: (i) => ({ x: 400 + i * 200, y: 200, angle: 0, scale: 80 }),
    placedPose: { x: 300, y: 200, angle: 0, scale: 80 },
    reversed: false,
    noTargets: false,
    factory(svg, hooks) {
      toy.hooks = hooks;
      let ghosts: LineMove[] = [];
      let state: LineState | null = null;
      svg.addEventListener('click', (ev) => {
        const el = (ev.target as Element).closest<SVGElement>('[data-move]');
        if (el) hooks.onMove(JSON.parse(el.dataset.move!) as LineMove);
      });
      return {
        render(s, o) {
          toy.renders.push({ state: s, opts: o });
          state = s;
          ghosts = [...o.ghostMoves];
          svg.innerHTML =
            s.placed
              .map((p) => `<g class="placed${o.hideSeq === p.seq ? ' incoming' : ''}" data-seq="${p.seq}"></g>`)
              .join('') +
            (o.interactive
              ? ghosts.map((m) => `<g class="ghost" data-move='${JSON.stringify(m)}'></g>`).join('')
              : '');
        },
        placedScreenPoint: (seq) => (state?.placed[seq] ? toy.placedPose : null),
        ghostTargets: (): GhostTarget<LineMove>[] =>
          (toy.noTargets ? [] : ghosts).map((move, i) => {
            const pose = toy.ghostPose(i);
            const t = parseTile((move as { tile: TileId }).tile);
            const values: readonly [number, number] = toy.reversed ? [t.lo, t.hi] : [t.hi, t.lo];
            return { move, x: pose.x, y: pose.y, pose, values };
          }),
        ensureVisible: (seq) => void toy.ensured.push(seq),
        setAutoFit(on) {
          toy.autoFit = on;
        },
        isAutoFit: () => toy.autoFit,
      };
    },
  };
  return toy;
}
