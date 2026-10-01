// Время обдумывания на экране итогов: честные замеры ходов и подстановка
// среднего там, где замера нет. Подстановка живёт только на показе.

/**
 * Сумма значений с подстановкой среднего вместо null: каждому null — среднее
 * известных. Все значения null — null: показывать нечего.
 */
export function avgFill(vals: readonly (number | null)[]): number | null {
  const known = vals.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const sum = known.reduce((a, b) => a + b, 0);
  return Math.round((sum * vals.length) / known.length);
}

/** Оценка времени раунда: ходы без честного t получают среднее по замеренным ходам этого же раунда. */
export function roundTimeMs(moves: readonly { readonly t?: number }[]): number | null {
  return avgFill(moves.map((m) => (typeof m.t === 'number' ? m.t : null)));
}

/** м:сс до часа, дальше ч:мм:сс — три сегмента не спутать с двумя. */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(min).padStart(2, '0')}:${ss}` : `${min}:${ss}`;
}

/**
 * Время последнего раунда и всего матча для экрана итогов. Раунд совсем без
 * замеров получает среднее замеренных раундов; ни одного замера — null.
 */
export function matchTimes(
  rounds: readonly { readonly moves: readonly { readonly t?: number }[] }[],
): { round: number; match: number } | null {
  const perRound = rounds.map((r) => roundTimeMs(r.moves));
  const known = perRound.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  return {
    round: Math.round(perRound[perRound.length - 1] ?? avg),
    match: Math.round(perRound.reduce((acc: number, v) => acc + (v ?? avg), 0)),
  };
}
