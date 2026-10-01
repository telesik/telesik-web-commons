// «Как играть» — каркас: оверлей со слайдами, вопрос при первом запуске и
// кирпичики сцен на графике костей. Слайды, тексты, логотип и ссылка на
// правила — у игры; стили (классы card, btn, howto-*) — из стилей игры.
// Оверлей самостоятельный: своя разметка, свой обработчик, состояния игры
// не трогает.
import { esc } from './html';
import { ensureTileDefs, tileBack, tileFace, type TileBackOptions } from './tile-svg';

export interface HowtoSlide {
  title: string;
  text: string;
  sub: string;
  /** Готовый <svg> сцены. */
  scene: string;
}

const ROOT_ID = 'howto';
const ASK_ID = 'howto-ask';

// ---------------------------------------------------------------------------
// Кирпичики сцен

/** Кость лицом в точке (x, y): горизонтально или стоймя, с масштабом. */
export function sceneTile(
  a: number,
  b: number,
  x: number,
  y: number,
  o: { vertical?: boolean; accent?: boolean; scale?: number } = {},
): string {
  const rot = o.vertical ? ' rotate(90)' : '';
  const sc = o.scale ? ` scale(${o.scale})` : '';
  return `<g transform="translate(${x} ${y})${rot}${sc}">${tileFace(a, b, { accent: o.accent, shadow: 'tile' })}</g>`;
}

/** Кость рубашкой вверх в точке (x, y). */
export function sceneBack(
  x: number,
  y: number,
  o: { vertical?: boolean; scale?: number; emblem?: TileBackOptions['emblem'] } = {},
): string {
  const rot = o.vertical ? ' rotate(90)' : '';
  return `<g transform="translate(${x} ${y})${rot} scale(${o.scale ?? 1})">${tileBack({ shadow: 'tile', emblem: o.emblem })}</g>`;
}

/** Кружок с числом открытого конца. */
export function sceneEndMark(x: number, y: number, n: number): string {
  return `<g><circle cx="${x}" cy="${y}" r="15" fill="#151d19" stroke="#c9a86a" stroke-width="2"/>
    <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" font-family="Georgia,serif" fill="#c9a86a">${n}</text></g>`;
}

/** Крестик: закрыто, сюда больше не ходят. */
export function sceneClosedMark(x: number, y: number): string {
  return `<g stroke="#c2543a" stroke-width="3" stroke-linecap="round"><line x1="${x - 9}" y1="${y - 9}" x2="${x + 9}" y2="${y + 9}"/><line x1="${x + 9}" y1="${y - 9}" x2="${x - 9}" y2="${y + 9}"/></g>`;
}

export function sceneArrow(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c9a86a" stroke-width="2" marker-end="url(#howto-arr)" opacity=".85"/>`;
}

/** Подпись; текст экранируется. */
export function sceneLabel(x: number, y: number, t: string, o: { anchor?: string; dim?: boolean } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? 'middle'}" font-size="13" fill="${o.dim ? '#97a099' : '#e6ded0'}">${esc(t)}</text>`;
}

/**
 * Обёртка сцены. Градиенты костей берутся из общего хоста документа
 * (ensureTileDefs), не копируются: дубликаты id ломают ссылки url(#…) в WebKit.
 */
export function scene(w: number, h: number, inner: string): string {
  const defs = `<defs><marker id="howto-arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#c9a86a"/></marker></defs>`;
  return `<svg class="howto-svg" viewBox="0 0 ${w} ${h}" width="100%" role="img">${defs}${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Оверлей со слайдами

export interface HowtoTexts {
  /** Подпись крестика (aria-label). */
  close: string;
  /** «2 из 6». */
  kicker: (n: number, total: number) => string;
  /** Текст ссылки на полные правила (последний слайд). */
  fullRules: string;
  back: string;
  skip: string;
  next: string;
  done: string;
}

export interface HowtoOptions {
  slides: readonly HowtoSlide[];
  texts: HowtoTexts;
  /** Адрес полного текста правил — ссылка на последнем слайде. */
  rulesUrl: string;
  /** Вызывается по закрытию (любому: «Понятно», «Пропустить», крестик, тап по фону). */
  onClose?: () => void;
}

/** Открыть слайды. Повторный вызов при открытом оверлее — начать с первого. */
export function openHowTo(opts: HowtoOptions): void {
  ensureTileDefs();
  const { slides, texts: t } = opts;
  let idx = 0;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }
  const host = root;
  const close = (): void => {
    host.remove();
    opts.onClose?.();
  };
  const render = (): void => {
    const s = slides[idx]!;
    const last = idx === slides.length - 1;
    const dots = slides.map((_, i) => `<span class="${i === idx ? 'on' : ''}"></span>`).join('');
    host.innerHTML = `
      <div class="card howto-card">
        <button class="howto-close" data-howto="close" aria-label="${esc(t.close)}">×</button>
        <div class="howto-kicker">${esc(t.kicker(idx + 1, slides.length))}</div>
        <h1>${esc(s.title)}</h1>
        <div class="howto-scene">${s.scene}</div>
        <p>${esc(s.text)}</p>
        <p class="sub">${esc(s.sub)}</p>
        ${last ? `<p class="sub"><a href="${esc(opts.rulesUrl)}" target="_blank" rel="noopener">${esc(t.fullRules)}</a></p>` : ''}
        <div class="howto-foot">
          <button class="howto-ghost" data-howto="${last ? 'prev' : 'skip'}">${esc(last ? t.back : t.skip)}</button>
          <div class="howto-dots">${dots}</div>
          <button class="btn howto-next" data-howto="${last ? 'done' : 'next'}">${esc(last ? t.done : t.next)}</button>
        </div>
      </div>`;
  };
  host.onclick = (ev) => {
    const target = ev.target as HTMLElement;
    if (target === host) {
      close();
      return;
    }
    const b = target.closest<HTMLElement>('[data-howto]');
    if (!b) return;
    const act = b.dataset.howto;
    if (act === 'next') {
      idx = Math.min(idx + 1, slides.length - 1);
      render();
    } else if (act === 'prev') {
      idx = Math.max(idx - 1, 0);
      render();
    } else {
      close();
    }
  };
  render();
}

// ---------------------------------------------------------------------------
// Вопрос при первом запуске

export interface HowtoAskOptions {
  /** Логотип игры — готовая разметка (обычно <svg>). */
  logo: string;
  texts: { ask: string; later: string; yes: string };
  /** Игрок хочет посмотреть слайды. */
  onShow: () => void;
  /** «Позже» или тап по фону — вопрос больше не задаём. */
  onLater: () => void;
}

/**
 * Вопрос при первом запуске после установки: слайды не открываются сразу —
 * поверх стартовой карточки короткий вопрос «Показать, как играть?». Любой
 * ответ закрывает окно; слайды — только по «Показать».
 */
export function openHowToAsk(opts: HowtoAskOptions): void {
  let root = document.getElementById(ASK_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ASK_ID;
    document.body.appendChild(root);
  }
  const host = root;
  host.innerHTML = `
    <div class="card howto-ask">
      ${opts.logo}
      <p>${esc(opts.texts.ask)}</p>
      <div class="howto-ask-row">
        <button class="btn" data-howto="later">${esc(opts.texts.later)}</button>
        <button class="btn howto-next" data-howto="show">${esc(opts.texts.yes)}</button>
      </div>
    </div>`;
  const finish = (show: boolean): void => {
    host.remove();
    if (show) opts.onShow();
    else opts.onLater();
  };
  host.onclick = (ev) => {
    const target = ev.target as HTMLElement;
    if (target === host) {
      finish(false);
      return;
    }
    const b = target.closest<HTMLElement>('[data-howto]');
    if (b) finish(b.dataset.howto === 'show');
  };
}
