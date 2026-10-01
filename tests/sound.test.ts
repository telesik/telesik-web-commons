// AudioContext переживает 'closed': на iOS показ системного
// браузера поверх WKWebView может закрыть аудиоконтекст без возможности
// resume(). Мок AudioContext воспроизводит только то, что реально вызывает
// код синтеза (knock/noise) и out() — без загрузки сэмплов (fetch не мокаем,
// loadSamples() сама глотает ошибку сети).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Лог значений gain.setValueAtTime всех узлов — ловит глушение мастера. */
const gainLog: number[] = [];

class FakeNode {
  context: unknown;
  gain = {
    setValueAtTime: (v: number) => {
      gainLog.push(v);
    },
    cancelScheduledValues: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };
  frequency = {
    value: 0,
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };
  Q = { value: 0 };
  type = '';
  buffer: unknown = null;
  playbackRate = { value: 1 };
  constructor(ctx: unknown) {
    this.context = ctx;
  }
  connect(dest: unknown): unknown {
    return dest;
  }
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' | 'interrupted' | 'closed' = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  /** Сколько осцилляторов создано — отличает «синтез играет» от «тишины». */
  oscillators = 0;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain(): FakeNode {
    return new FakeNode(this);
  }
  createBufferSource(): FakeNode {
    return new FakeNode(this);
  }
  createBiquadFilter(): FakeNode {
    return new FakeNode(this);
  }
  createOscillator(): FakeNode {
    this.oscillators++;
    return new FakeNode(this);
  }
  createBuffer(
    _channels: number,
    len: number,
    sampleRate: number,
  ): { sampleRate: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(len);
    return { sampleRate, getChannelData: () => data };
  }
  resume(): Promise<void> {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('sound.ts — переживает закрытие AudioContext', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances.length = 0;
    gainLog.length = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('нет сети в тесте')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('после close() следующий звук пересоздаёт контекст, а не молчит', async () => {
    const { setSoundEnabled, playDraw } = await import('../src/sound');

    setSoundEnabled(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    const first = FakeAudioContext.instances[0]!;

    expect(() => playDraw()).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(1); // тот же контекст переиспользован

    await first.close();
    expect(first.state).toBe('closed');

    // До фикса: ensureCtx() видел ctx!==null и звал только resume(), который
    // из 'closed' не выводит — контекст оставался мёртвым, звук пропадал молча.
    expect(() => playDraw()).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances[1]!.state).not.toBe('closed');
  });

  it('до загрузки записей играет синтез: каждый стук создаёт осцилляторы', async () => {
    const { setSoundEnabled, playPlace, playShuffle, isSoundEnabled } = await import(
      '../src/sound'
    );
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    const ctx = FakeAudioContext.instances[0]!;

    playPlace('accent'); // торжественный двойной стук — два knock
    expect(ctx.oscillators).toBe(2);
    playPlace('heavy');
    expect(ctx.oscillators).toBe(3);
    playPlace('normal');
    expect(ctx.oscillators).toBe(4);
    playPlace('normal');
    expect(ctx.oscillators).toBe(5);
    playShuffle(); // записи нет — тишина (retry загрузки), синтеза у шаффла нет
    expect(ctx.oscillators).toBe(5);

    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    playPlace('accent'); // выключено — ранний выход, синтез не запускается
    expect(ctx.oscillators).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Сэмплы записей: fetch и decodeAudioData замоканы синтетическими буферами,
// чтобы настоящая разметка (analyze/findBursts) отработала на известной
// картинке: тишина по краям отрезается, встряски коробки находятся пачками,
// коротышки отбрасываются, нулевая запись не ломает границы.
// ---------------------------------------------------------------------------

const SR = 8000;

/** Буфер из кусков [длительностьСек, амплитуда]; амплитуда 0 — тишина. */
function makeBuf(parts: Array<[number, number]>): FakeAudioBuffer {
  const total = Math.round(parts.reduce((s, [d]) => s + d, 0) * SR);
  const data = new Float32Array(total);
  let i = 0;
  for (const [dur, amp] of parts) {
    const n = Math.round(dur * SR);
    for (let k = 0; k < n && i < total; k++, i++) data[i] = amp;
  }
  return new FakeAudioBuffer(data);
}

class FakeAudioBuffer {
  numberOfChannels = 1;
  sampleRate = SR;
  constructor(private data: Float32Array) {}
  get length(): number {
    return this.data.length;
  }
  get duration(): number {
    return this.data.length / SR;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

interface StartedSource {
  buffer: FakeAudioBuffer | null;
  args: number[];
  rate: number;
}

class SampleAudioContext extends FakeAudioContext {
  static bufs: Record<string, FakeAudioBuffer> = {};
  started: StartedSource[] = [];
  override createBufferSource(): FakeNode {
    const node = new FakeNode(this);
    node.start = (...args: number[]) => {
      this.started.push({
        buffer: node.buffer as FakeAudioBuffer | null,
        args,
        rate: node.playbackRate.value,
      });
    };
    return node;
  }
  decodeAudioData(tag: unknown): Promise<FakeAudioBuffer> {
    const buf = SampleAudioContext.bufs[String(tag)];
    return buf ? Promise.resolve(buf) : Promise.reject(new Error(`нет буфера ${String(tag)}`));
  }
}

/**
 * Дождаться цепочки fetch → arrayBuffer → decode → then: она целиком
 * микрозадачная, одной макрозадачи достаточно. NB: с vi.useFakeTimers()
 * этот setTimeout не сработает — в этом файле реальные таймеры.
 */
const flushLoad = () => new Promise((r) => setTimeout(r, 0));

/**
 * Свежий модуль звука с включённым звуком после `waves` волн загрузки:
 * одна — записи декодированы с первой попытки, две — первая волна (m4a)
 * отвергнута и подхвачен WAV-набор.
 */
async function loadSound(waves = 1) {
  const mod = await import('../src/sound');
  mod.setSoundEnabled(true);
  for (let i = 0; i < waves; i++) await flushLoad();
  return mod;
}

describe('sound.ts — записи: разметка и сэмпловое проигрывание', () => {
  // Встряски коробки (сек): A 0.3–0.5, B 0.9–1.1, C 1.5–1.65; блип 0.02 с
  // на 1.85 короче minLen и должен быть отброшен разметкой.
  const place1 = () => makeBuf([[0.1, 0], [0.2, 0.5], [0.1, 0]]);
  const place2 = () => makeBuf([[0.05, 0], [0.15, 0.25], [0.05, 0]]);
  const box = () =>
    makeBuf([
      [0.3, 0], [0.2, 0.6], [0.4, 0], [0.2, 0.5], [0.4, 0], [0.15, 0.4],
      [0.2, 0], [0.02, 0.5], [0.13, 0],
    ]);
  const silentShuffle = () => makeBuf([[3, 0]]);

  let ctxOf: () => SampleAudioContext;

  beforeEach(async () => {
    vi.resetModules();
    FakeAudioContext.instances.length = 0;
    gainLog.length = 0;
    SampleAudioContext.bufs = {
      'place-1': place1(),
      'place-2': place2(),
      box: box(),
      shuffle: silentShuffle(),
    };
    vi.stubGlobal('AudioContext', SampleAudioContext);
    vi.stubGlobal('fetch', (url: string) => {
      const tag = ['place-1', 'place-2', 'box', 'shuffle'].find((t) => url.includes(t));
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(tag) });
    });
    ctxOf = () => FakeAudioContext.instances[0] as SampleAudioContext;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('после загрузки играют записи, а не синтез; тишина в начале отрезана', async () => {
    const { playPlace } = await loadSound();
    const ctx = ctxOf();

    playPlace('accent'); // торжественный двойной стук: оба дубля записи
    expect(ctx.started).toHaveLength(2);
    expect(ctx.oscillators).toBe(0); // синтез не задействован
    const [first, second] = ctx.started;
    expect(first!.buffer).toBe(SampleAudioContext.bufs['place-1']);
    expect(second!.buffer).toBe(SampleAudioContext.bufs['place-2']);
    // start(t, from, dur): from — начало звука в записи, тишина 0.1 с отрезана.
    expect(first!.args[1]).toBeGreaterThan(0.05);
    expect(first!.args[1]).toBeLessThan(0.15);

    ctx.started.length = 0;
    playPlace('heavy'); // поперёк: один дубль, жёстче и ниже
    expect(ctx.started).toHaveLength(1);
    expect(ctx.started[0]!.rate).toBeCloseTo(0.86, 5);

    ctx.started.length = 0;
    playPlace('normal');
    expect(ctx.started).toHaveLength(1);
    expect(ctx.started[0]!.rate).toBeGreaterThanOrEqual(0.96);
    expect(ctx.started[0]!.rate).toBeLessThanOrEqual(1.04);
  });

  it('добор: случайная встряска из размеченных пачек, коротышка отброшена', async () => {
    const { playDraw } = await loadSound();
    const ctx = ctxOf();
    const boxBuf = SampleAudioContext.bufs['box']!;
    // Пачки начинаются на ~0.29 / 0.89 / 1.49 (окна 20 мс, левая граница
    // пачки откатывается на 10 мс — findBursts в sound.ts).
    for (let i = 0; i < 20; i++) {
      ctx.started.length = 0;
      playDraw();
      expect(ctx.started).toHaveLength(1);
      const s = ctx.started[0]!;
      expect(s.buffer).toBe(boxBuf);
      const from = s.args[1]!;
      const near = (t: number) => Math.abs(from - t) < 0.06;
      expect(near(0.29) || near(0.89) || near(1.49), `from=${from}`).toBe(true);
      expect(from).toBeLessThan(1.7); // блип на 1.85 в пачки не попал
    }
    expect(ctx.oscillators).toBe(0);

    // Детерминированная проверка отброса коротышки: Math.random → 0.999
    // выбирает ПОСЛЕДНЮЮ пачку. Будь блип четвёртой пачкой — from был бы
    // ~1.84; должна быть C (~1.49).
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    ctx.started.length = 0;
    playDraw();
    expect(Math.abs(ctx.started[0]!.args[1]! - 1.49)).toBeLessThan(0.06);
  });

  it('нулевая запись размечается всем буфером и играет без ошибок', async () => {
    const { playShuffle } = await loadSound();
    const ctx = ctxOf();
    playShuffle();
    expect(ctx.started).toHaveLength(1);
    const s = ctx.started[0]!;
    expect(s.buffer).toBe(SampleAudioContext.bufs['shuffle']);
    const from = s.args[1]!;
    const dur = s.args[2]!;
    expect(from).toBeGreaterThanOrEqual(0); // peak=0: границы 0…duration
    expect(from).toBeLessThanOrEqual(1);
    expect(dur).toBeCloseTo(2, 5); // фрагмент ровно 2 с из середины записи
  });

  it('выключение ставит мастеру ноль и не запускает новые звуки', async () => {
    const { setSoundEnabled, playDraw } = await loadSound();
    const ctx = ctxOf();
    playDraw(); // создаёт мастер-гейн и уже играющий звук
    expect(ctx.started).toHaveLength(1);

    gainLog.length = 0;
    setSoundEnabled(false);
    // Глушение бьёт и по уже играющему: мастеру выставлен 0 (setValueAtTime в sound.ts).
    expect(gainLog).toContain(0);

    ctx.started.length = 0;
    playDraw();
    expect(ctx.started).toHaveLength(0); // новый звук не запускается
  });
});

// ---------------------------------------------------------------------------
// Платформенные фолбэки: на Mac (Designed for iPad) WebKit не декодирует
// AAC, хотя файлы целы: жив только WAV; после
// беззвучного переключателя iPhone контекст застревает в 'interrupted'
// и resume() его не будит — второй подряд застрявший звук обязан
// пересоздать контекст (AudioBuffer-ы от контекста не зависят).
// ---------------------------------------------------------------------------

describe('sound.ts — платформенные фолбэки звука', () => {
  const wavBufs = () => ({
    'place-1-wav': makeBuf([[0.1, 0], [0.2, 0.5], [0.1, 0]]),
    'place-2-wav': makeBuf([[0.05, 0], [0.15, 0.25], [0.05, 0]]),
    'box-wav': makeBuf([[0.3, 0], [0.2, 0.6], [0.4, 0], [0.2, 0.5], [0.4, 0], [0.15, 0.4], [0.2, 0]]),
    'shuffle-wav': makeBuf([[3, 0.3]]),
  });

  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances.length = 0;
    gainLog.length = 0;
    vi.stubGlobal('AudioContext', SampleAudioContext);
    // Теги несут и имя, и формат: box.m4a → 'box-m4a', box.wav → 'box-wav'.
    vi.stubGlobal('fetch', (url: string) => {
      const name = ['place-1', 'place-2', 'box', 'shuffle'].find((t) => url.includes(t));
      const ext = url.endsWith('.wav') || url.includes('.wav') ? 'wav' : 'm4a';
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(`${name}-${ext}`) });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('AAC не декодится — записи приезжают WAV-набором, синтез не нужен', async () => {
    // В декодере ЕСТЬ только wav-теги: любой m4a-буфер отвергается,
    // как в WebKit «iOS-app на Mac».
    SampleAudioContext.bufs = wavBufs();
    const mod = await loadSound(2);
    const ctx = FakeAudioContext.instances[0] as SampleAudioContext;
    mod.playPlace('normal');
    expect(ctx.started.length).toBe(1); // играет ЗАПИСЬ
    expect(ctx.oscillators).toBe(0); // а не синтез
  });

  it('оба формата не декодятся — честный синтез, как раньше', async () => {
    SampleAudioContext.bufs = {}; // декодер отвергает всё
    const mod = await loadSound(2);
    const ctx = FakeAudioContext.instances[0] as SampleAudioContext;
    mod.playPlace('normal');
    // Синтез — осциллятор плюс шумовой щелчок (он тоже BufferSource,
    // но из createBuffer, а не из декодированной записи).
    expect(ctx.oscillators).toBe(1);
    expect(ctx.started.every((s) => !(s.buffer instanceof FakeAudioBuffer))).toBe(true);
  });

  it('контекст застрял не-running и resume не будит — второй звук пересоздаёт', async () => {
    SampleAudioContext.bufs = wavBufs();
    const mod = await loadSound(2);
    const first = FakeAudioContext.instances[0]!;
    // Симуляция беззвучного переключателя: interrupted, resume бессилен.
    first.state = 'interrupted';
    first.resume = () => Promise.resolve(); // state НЕ меняется
    mod.playPlace('normal'); // такт 1: попытка resume
    expect(FakeAudioContext.instances).toHaveLength(1);
    mod.playPlace('normal'); // такт 2: контекст признан мёртвым
    expect(FakeAudioContext.instances).toHaveLength(2);
    const second = FakeAudioContext.instances[1] as SampleAudioContext;
    // Кэш записей пережил замену: играет запись в НОВОМ контексте.
    expect(second.started.length).toBe(1);
  });

  it('живой running-контекст серией звуков не пересоздаётся', async () => {
    SampleAudioContext.bufs = wavBufs();
    const mod = await loadSound(2);
    mod.playPlace('normal');
    mod.playPlace('normal');
    mod.playDraw();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Края: аудиоконтекст недоступен, повторное включение, выключенный звук.
// ---------------------------------------------------------------------------

describe('sound.ts — края', () => {
  const bufs = () => ({
    'place-1': makeBuf([[0.1, 0], [0.2, 0.5], [0.1, 0]]),
    'place-2': makeBuf([[0.05, 0], [0.15, 0.25], [0.05, 0]]),
    box: makeBuf([[0.3, 0], [0.2, 0.6], [0.4, 0]]),
    shuffle: makeBuf([[3, 0.3]]),
  });

  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances.length = 0;
    gainLog.length = 0;
    SampleAudioContext.bufs = bufs();
    vi.stubGlobal('AudioContext', SampleAudioContext);
    vi.stubGlobal('fetch', (url: string) => {
      const tag = ['place-1', 'place-2', 'box', 'shuffle'].find((t) => url.includes(t));
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(tag) });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('аудиоконтекст не создаётся — звуки молчат без исключений', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('аудио недоступно');
        }
      },
    );
    const mod = await import('../src/sound');
    expect(() => mod.setSoundEnabled(true)).not.toThrow();
    expect(mod.isSoundEnabled()).toBe(true);
    expect(() => {
      mod.playPlace('accent');
      mod.playPlace('heavy');
      mod.playPlace('normal');
      mod.playDraw();
      mod.playShuffle();
    }).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('контекст закрылся, а новый не создаётся — запись не играет, исключений нет', async () => {
    const mod = await loadSound();
    const ctx = FakeAudioContext.instances[0] as SampleAudioContext;
    await ctx.close();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('аудио недоступно');
        }
      },
    );
    expect(() => mod.playPlace('normal')).not.toThrow();
    expect(ctx.started).toHaveLength(0);
  });

  it('повторное включение возвращает мастеру единицу', async () => {
    const mod = await loadSound();
    mod.playDraw(); // создаёт мастер-гейн
    mod.setSoundEnabled(false);
    gainLog.length = 0;
    mod.setSoundEnabled(true);
    expect(gainLog).toContain(1);
  });

  it('выключенный звук: ни стук, ни добор, ни перемешивание не запускаются', async () => {
    const mod = await loadSound();
    const ctx = FakeAudioContext.instances[0] as SampleAudioContext;
    mod.setSoundEnabled(false);
    mod.playPlace('normal');
    mod.playDraw();
    mod.playShuffle();
    expect(ctx.started).toHaveLength(0);
    expect(ctx.oscillators).toBe(0);
  });

  it('жёсткий стук берёт любой из двух дублей записи', async () => {
    const mod = await loadSound();
    const ctx = FakeAudioContext.instances[0] as SampleAudioContext;
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0.1);
    mod.playPlace('heavy');
    random.mockReturnValue(0.9);
    mod.playPlace('heavy');
    expect(ctx.started.map((s) => s.buffer)).toEqual([
      SampleAudioContext.bufs['place-1'],
      SampleAudioContext.bufs['place-2'],
    ]);
    // Обычный стук — тоже любой из двух.
    ctx.started.length = 0;
    random.mockReturnValue(0.1);
    mod.playPlace('normal');
    random.mockReturnValue(0.9);
    mod.playPlace('normal');
    expect(ctx.started.map((s) => s.buffer)).toEqual([
      SampleAudioContext.bufs['place-1'],
      SampleAudioContext.bufs['place-2'],
    ]);
  });
});
