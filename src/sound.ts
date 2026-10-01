// Звуки домино. Основа — собственные записи студии (sounds/*.m4a): стук
// кости о стол в двух дублях, встряхивание коробки с домино и перемешивание
// базара. Сторонних ресурсов нет. Пока записи не загрузились или не
// декодировались, работает WebAudio-синтез — он остаётся запасным.

import boxUrl from './sounds/box.m4a';
import { lcg } from './lcg';
import place1Url from './sounds/place-1.m4a';
import place2Url from './sounds/place-2.m4a';
import shuffleUrl from './sounds/shuffle.m4a';
// Запасной несжатый набор (mono 24 kHz, из тех же записей): WebKit в
// окружении «iOS-приложение на Mac» (Designed for iPad) не декодирует AAC
// при целых файлах — жив только WAV. Набор качается ТОЛЬКО после провала
// AAC: iPhone и браузеры его не видят.
import boxWavUrl from './sounds/box.wav';
import place1WavUrl from './sounds/place-1.wav';
import place2WavUrl from './sounds/place-2.wav';
import shuffleWavUrl from './sounds/shuffle.wav';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let noiseBuf: AudioBuffer | null = null;

/** Запись с метаданными: границы активного звука и множитель нормализации. */
interface Sample {
  buf: AudioBuffer;
  start: number; // сек: начало звука (тишина в записи отрезана)
  end: number; // сек: конец звука + короткий хвост
  norm: number; // множитель, приводящий пик записи к 1.0
  bursts?: Array<[number, number]>; // отдельные встряхи (для коробки)
}

let samples: { place: [Sample, Sample]; box: Sample; shuffle: Sample } | null = null;
let samplesLoading = false;

/** Счётчик подряд идущих звуков, заставших контекст не-running. */
let ctxStuck = 0;

/** Рабочий аудиоконтекст. Вызывается только при включённом звуке. */
function ensureCtx(): AudioContext | null {
  // 'closed' необратим (resume() из него не выводит) — например iOS закрывает
  // контекст WKWebView, пока поверх показан SFSafariViewController.
  // master привязан к старому ctx.destination, тоже пересоздаётся ниже в out().
  // Второй случай: после беззвучного переключателя iPhone контекст
  // застревает в 'interrupted', и resume() его НЕ будит. Отличить «ещё не
  // разбужен» от «застрял навсегда» заранее нельзя, поэтому два такта:
  // первый не-running звук пробует resume(), второй подряд — признаёт
  // контекст мёртвым и пересоздаёт. Декодированные записи (AudioBuffer)
  // от контекста не зависят и переживают замену без перезагрузки.
  if (ctx && (ctx.state === 'closed' || (ctx.state !== 'running' && ctxStuck >= 1))) {
    ctx = null;
    master = null;
    ctxStuck = 0;
  }
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // iOS после прерывания аудиосессии (звонок, Siri) оставляет контекст
  // в нестандартном состоянии 'interrupted' — поэтому не сравнивать с 'suspended'.
  if (ctx.state !== 'running') {
    ctxStuck++;
    ctx.resume().catch(() => {});
  } else {
    ctxStuck = 0;
  }
  return ctx;
}

/** Общий выход: через него идёт всё, чтобы mute глушил и уже играющее. */
function out(ac: AudioContext): GainNode {
  if (!master || master.context !== ac) {
    master = ac.createGain();
    master.connect(ac.destination);
  }
  return master;
}

/** Максимум модуля по каналам в сэмпле i. */
function peakAt(chans: Float32Array[], i: number): number {
  let v = 0;
  for (const d of chans) {
    const a = Math.abs(d[i]!);
    if (a > v) v = a;
  }
  return v;
}

/**
 * Разметка записи: пик, границы звука (порог 5% от пика), нормализация.
 * Записи бытовые — уровни и паузы у дублей разные, поэтому всё адаптивно.
 */
function analyze(buf: AudioBuffer, withBursts = false): Sample {
  const n = buf.length;
  const sr = buf.sampleRate;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));

  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = peakAt(chans, i);
    if (v > peak) peak = v;
  }
  if (peak <= 0) return { buf, start: 0, end: buf.duration, norm: 1 };

  const th = peak * 0.05;
  let first = 0;
  while (first < n && peakAt(chans, first) <= th) first++;
  let last = n - 1;
  while (last > first && peakAt(chans, last) <= th) last--;

  const s: Sample = {
    buf,
    start: Math.max(0, first / sr - 0.003),
    end: Math.min(buf.duration, last / sr + 0.06),
    norm: 1 / peak,
  };
  if (withBursts) s.bursts = findBursts(chans, n, sr, peak);
  return s;
}

/**
 * Поиск отдельных встрясок в записи коробки: окна по 20 мс, активные окна
 * (пик > 7% от общего) сливаются через паузы < 150 мс, коротышки отбрасываются.
 */
function findBursts(
  chans: Float32Array[],
  n: number,
  sr: number,
  peak: number,
): Array<[number, number]> {
  const win = Math.floor(sr * 0.02);
  const th = peak * 0.07;
  const active: boolean[] = [];
  for (let w = 0; w * win < n; w++) {
    let v = 0;
    for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) {
      const p = peakAt(chans, i);
      if (p > v) v = p;
    }
    active.push(v > th);
  }
  const maxGap = 8; // окон: ~160 мс
  const minLen = 3; // окон: ~60 мс
  const bursts: Array<[number, number]> = [];
  let from = -1;
  let gap = 0;
  for (let w = 0; w <= active.length; w++) {
    if (w < active.length && active[w]) {
      if (from < 0) from = w;
      gap = 0;
    } else if (from >= 0 && (++gap > maxGap || w === active.length)) {
      const to = w - gap;
      if (to - from + 1 >= minLen) {
        bursts.push([
          Math.max(0, (from * win) / sr - 0.01),
          Math.min(n / sr, ((to + 1) * win) / sr + 0.08),
        ]);
      }
      from = -1;
    }
  }
  return bursts;
}

/** Наборы записей по убыванию предпочтения: AAC, затем запасной WAV. */
const SAMPLE_SETS: Array<[string, string, string, string]> = [
  [place1Url, place2Url, boxUrl, shuffleUrl],
  [place1WavUrl, place2WavUrl, boxWavUrl, shuffleWavUrl],
];

/** Однократная фоновая загрузка и разметка записей. */
function loadSamples(): void {
  if (samples || samplesLoading) return;
  const ac = ensureCtx();
  if (!ac) return;
  samplesLoading = true;
  const dec = async (url: string): Promise<AudioBuffer> =>
    ac.decodeAudioData(await (await fetch(url)).arrayBuffer());
  void (async () => {
    for (const [p1u, p2u, boxU, shU] of SAMPLE_SETS) {
      try {
        const [p1, p2, box, shuffle] = await Promise.all([dec(p1u), dec(p2u), dec(boxU), dec(shU)]);
        samples = {
          place: [analyze(p1), analyze(p2)],
          box: analyze(box, true),
          shuffle: analyze(shuffle),
        };
        return;
      } catch {
        // формат не пошёл (Mac DFI режет AAC) — пробуем следующий набор
      }
    }
    samplesLoading = false; // ни один набор не вышел — остаёмся на синтезе
  })();
}

/**
 * Проигрывание фрагмента записи. vol — громкость к нормализованному пику,
 * rate — скорость (высота), at — задержка, from/to — границы в секундах записи.
 */
function playSample(
  s: Sample,
  opts: {
    vol: number;
    rate: number;
    at?: number;
    from?: number;
    to?: number;
    fadeIn?: number; // сек: плавный вход для фрагментов, начатых посреди звука
  },
): void {
  const ac = ensureCtx();
  if (!ac) return;
  const rate = opts.rate;
  const t = ac.currentTime + (opts.at ?? 0);
  const from = opts.from ?? s.start;
  const to = Math.max(from + 0.03, opts.to ?? s.end);
  const wallDur = (to - from) / rate;

  const src = ac.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  const v = opts.vol * s.norm;
  const fadeIn = Math.min(opts.fadeIn ?? 0, wallDur * 0.3);
  const fade = Math.min(0.2, wallDur * 0.3);
  if (fadeIn > 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + fadeIn);
  } else {
    g.gain.setValueAtTime(v, t);
  }
  g.gain.setValueAtTime(v, t + wallDur - fade);
  g.gain.linearRampToValueAtTime(0.0001, t + wallDur);
  src.connect(g).connect(out(ac));
  src.start(t, from, to - from);
}

/** Короткий буфер белого шума — «щелчок» контакта кости со столом (синтез). */
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.06);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  const rand = lcg(22222);
  for (let i = 0; i < len; i++) {
    data[i] = (rand() * 2 - 1) * (1 - i / len);
  }
  return noiseBuf;
}

/**
 * Синтезированный «стук»: фильтрованный щелчок + глухой корпусный удар.
 * freq — тон корпуса, sharp — яркость щелчка, vol — громкость, at — задержка.
 */
function knock(freq: number, sharp: number, vol: number, at = 0): void {
  const ac = ensureCtx();
  if (!ac) return;
  const t = ac.currentTime + at;

  const click = ac.createBufferSource();
  click.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = sharp;
  bp.Q.value = 1.1;
  const clickGain = ac.createGain();
  clickGain.gain.setValueAtTime(vol, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
  click.connect(bp).connect(clickGain).connect(out(ac));
  click.start(t);

  const body = ac.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(freq, t);
  body.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.09);
  const bodyGain = ac.createGain();
  bodyGain.gain.setValueAtTime(vol * 0.8, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  body.connect(bodyGain).connect(out(ac));
  body.start(t);
  body.stop(t + 0.13);
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (on) {
    ensureCtx();
    loadSamples();
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(1, ctx.currentTime);
    }
  } else if (ctx && master) {
    // Глушим сразу и уже запущенные звуки (актуально для перемешивания ~2 с).
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * Как звучит выставленная кость: normal — обычный стук; accent —
 * торжественный двойной (первая кость стола: корень, локомотив); heavy —
 * жёстче и ниже (кость, закрывающая ветку или легшая поперёк).
 */
export type PlaceSound = 'normal' | 'accent' | 'heavy';

/** Выставление кости. */
export function playPlace(kind: PlaceSound): void {
  if (!enabled) return;
  const sm = samples;
  if (!sm) {
    loadSamples(); // после сбоя сети пробуем снова при каждом звуке
    switch (kind) {
      case 'accent':
        knock(200, 2100, 0.16);
        knock(160, 1700, 0.12, 0.07);
        break;
      case 'heavy':
        knock(140, 1500, 0.2);
        break;
      default:
        knock(190 + Math.random() * 30, 2000 + Math.random() * 400, 0.15);
    }
    return;
  }
  const [p1, p2] = sm.place;
  switch (kind) {
    case 'accent':
      playSample(p1, { vol: 0.65, rate: 0.97 });
      playSample(p2, { vol: 0.5, rate: 1.04, at: 0.09 });
      break;
    case 'heavy':
      playSample(Math.random() < 0.5 ? p1 : p2, { vol: 0.75, rate: 0.86 });
      break;
    default:
      playSample(Math.random() < 0.5 ? p1 : p2, {
        vol: 0.6,
        rate: 0.96 + Math.random() * 0.08,
      });
  }
}

/** Добор из базара: случайная встряска коробки; до загрузки — синтез потише. */
export function playDraw(): void {
  if (!enabled) return;
  const box = samples?.box;
  const bursts = box?.bursts;
  if (!box || !bursts || bursts.length === 0) {
    if (!samples) loadSamples();
    knock(240, 2600, 0.07);
    knock(210, 2300, 0.05, 0.045);
    return;
  }
  const [from, to] = bursts[Math.floor(Math.random() * bursts.length)]!;
  playSample(box, { vol: 0.4, rate: 0.97 + Math.random() * 0.06, from, to });
}

/** Начало раунда: случайный фрагмент перемешивания базара; до загрузки — тихо. */
export function playShuffle(): void {
  if (!enabled) return;
  const sh = samples?.shuffle;
  if (!sh) {
    loadSamples();
    return;
  }
  const dur = 2.0;
  const span = Math.max(0, sh.end - sh.start - dur);
  const from = sh.start + Math.random() * span;
  playSample(sh, {
    vol: 0.45,
    rate: 0.98 + Math.random() * 0.04,
    from,
    to: Math.min(sh.end, from + dur),
    fadeIn: 0.06,
  });
}
