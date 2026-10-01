// Кнопка «Следующий раунд» на экране итогов: три состояния договора сторон
// в матче с внешним игроком. Чистая функция — отдельно от каркаса, чтобы
// состояния проверялись без DOM приложения.
import type { NextRoundWait } from './types';

export interface NextRoundLabels {
  /** Никто ещё не нажал. */
  readonly btnNextRound: string;
  /** Нажали мы — ждём подтверждения от соперника. */
  readonly btnWaiting: string;
  /** Соперник нажал первым и ждёт нас. */
  readonly btnPeerReady: string;
}

/**
 * Разметка кнопки. `remote` — в матче есть внешний игрок; без него состояние
 * договора не имеет смысла и игнорируется (игра с ботом, за одним экраном).
 * Ждём мы — кнопка погашена (disabled, класс waiting); соперник готов —
 * кнопка активна и подсвечена (класс peer-ready).
 */
export function nextRoundButton(
  wait: NextRoundWait | null,
  remote: boolean,
  t: NextRoundLabels,
): string {
  const w = remote ? wait : null;
  if (w?.waiting) {
    return `<button class="btn waiting" data-action="next-round" disabled>${t.btnWaiting}</button>`;
  }
  if (w?.peerReady) {
    return `<button class="btn peer-ready" data-action="next-round">${t.btnPeerReady}</button>`;
  }
  return `<button class="btn" data-action="next-round">${t.btnNextRound}</button>`;
}
