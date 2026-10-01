// Куча базара: кости рубашкой вверх, разбросанные поверх стола. Раскладка
// выводится из seed — одна и та же для живого раунда и для истории.
import { lcg } from '../lcg';

export interface PileSprite {
  x: number;
  y: number;
  rot: number;
  /** Кость ещё в куче; разобранные остаются в списке — зона кучи не съёживается. */
  alive: boolean;
}

/** Раскладка count костей кучи: со сдвигом и поворотом, немного внахлёст — как на столе. */
export function scatterSprites(seed: number, count: number): PileSprite[] {
  const rand = lcg(seed);
  const out: PileSprite[] = [];
  for (let i = 0; i < count; i++) {
    const x = 12 + rand() * 180;
    const y = 8 + rand() * 140;
    const rot = -50 + rand() * 100;
    out.push({ x, y, rot, alive: true });
  }
  return out;
}

/**
 * Кость кучи в HTML. back — рубашка (готовый <svg>); idx — номер спрайта для
 * добора кликом (в истории кликов нет — без номера).
 */
export function pileTileHtml(s: PileSprite, back: string, idx?: number): string {
  const data = idx === undefined ? '' : ` data-pile="${idx}"`;
  return `<div class="pile-tile"${data}
          style="left:${s.x}px; top:${s.y}px; --rot:${s.rot}deg; transform:rotate(${s.rot}deg)">
          ${back}
        </div>`;
}

/**
 * Погасить первые живые спрайты, пока разобранных не станет need: куча
 * догоняет базар, когда кость ушла мимо клика (добор бота, сети, сейв).
 */
export function killSprites(sprites: PileSprite[], need: number): void {
  let dead = sprites.filter((s) => !s.alive).length;
  for (let i = 0; i < sprites.length && dead < need; i++) {
    if (sprites[i]!.alive) {
      sprites[i]!.alive = false;
      dead++;
    }
  }
}

/**
 * Экранный прямоугольник всей кучи — по местам всех костей раунда, включая
 * уже разобранные: зона задана раскладкой в начале раунда и не съёживается
 * по ходу игры. null — рисовать нечего (базар пуст).
 */
export function pileZone(
  el: HTMLElement,
  sprites: readonly PileSprite[],
): { l: number; t: number; r: number; b: number } | null {
  const any = el.querySelector<HTMLElement>('.pile-tile');
  if (!any || sprites.length === 0) return null;
  // Размеры спрайта — до поворота (offset*), масштаб контейнера — из rect:
  // на телефоне куча ужата целиком через transform: scale().
  const w = any.offsetWidth;
  const h = any.offsetHeight;
  const rect = el.getBoundingClientRect();
  const k = el.offsetWidth ? rect.width / el.offsetWidth : 1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of sprites) {
    // Кость лежит повёрнутой — её след шире собственных w×h.
    const a = (s.rot * Math.PI) / 180;
    const halfW = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const halfH = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
    const cx = s.x + w / 2;
    const cy = s.y + h / 2;
    minX = Math.min(minX, cx - halfW);
    minY = Math.min(minY, cy - halfH);
    maxX = Math.max(maxX, cx + halfW);
    maxY = Math.max(maxY, cy + halfH);
  }
  return {
    l: rect.left + minX * k,
    t: rect.top + minY * k,
    r: rect.left + maxX * k,
    b: rect.top + maxY * k,
  };
}

/** Ближайший к точке живой спрайт кучи — ему и «улетать» при доборе. */
export function nearestPileSprite(el: HTMLElement, x: number, y: number): { idx: number; el: HTMLElement } | null {
  let best: { idx: number; el: HTMLElement } | null = null;
  let bestDist = Infinity;
  for (const tile of el.querySelectorAll<HTMLElement>('.pile-tile')) {
    const r = tile.getBoundingClientRect();
    const dx = r.left + r.width / 2 - x;
    const dy = r.top + r.height / 2 - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = { idx: Number(tile.dataset.pile), el: tile };
    }
  }
  return best;
}
