// @vitest-environment jsdom
// «Как играть» — каркас: навигация вперёд/назад, «Пропустить» и «Понятно»
// закрывают, крестик и тап по фону закрывают; на последнем слайде — ссылка
// на полные правила; вопрос при первом запуске; кирпичики сцен.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openHowTo,
  openHowToAsk,
  scene,
  sceneArrow,
  sceneBack,
  sceneClosedMark,
  sceneEndMark,
  sceneLabel,
  sceneTile,
  type HowtoSlide,
  type HowtoTexts,
} from '../src/howto';

const texts: HowtoTexts = {
  close: 'Закрыть',
  kicker: (n, total) => `${n} из ${total}`,
  fullRules: 'Полные правила',
  back: 'Назад',
  skip: 'Пропустить',
  next: 'Далее',
  done: 'Понятно',
};
const slides: HowtoSlide[] = [1, 2, 3].map((n) => ({
  title: `Слайд ${n}`,
  text: `Текст <${n}>`,
  sub: `Примечание ${n}`,
  scene: scene(100, 50, sceneTile(n, n, 50, 25)),
}));

const root = (): HTMLElement | null => document.getElementById('howto');
const ask = (): HTMLElement | null => document.getElementById('howto-ask');
const kicker = (): string => root()?.querySelector('.howto-kicker')?.textContent ?? '';
const click = (host: HTMLElement | null, sel: string): void => {
  const el = host?.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`нет ${sel}`);
  el.click();
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('openHowTo', () => {
  it('первый слайд: заголовок, экранированный текст, сцена, точки; общие определения костей на месте', () => {
    openHowTo({ slides, texts, rulesUrl: 'https://example.test/rules' });
    expect(kicker()).toBe('1 из 3');
    expect(root()?.querySelector('h1')?.textContent).toBe('Слайд 1');
    expect(root()?.querySelector('p')?.textContent).toBe('Текст <1>');
    expect(root()?.querySelector('.howto-scene svg')).not.toBeNull();
    expect(root()?.querySelectorAll('.howto-dots span')).toHaveLength(3);
    expect(root()?.querySelectorAll('.howto-dots span.on')).toHaveLength(1);
    expect(document.getElementById('tile-defs')).not.toBeNull();
    expect(root()?.querySelector('a')).toBeNull();
  });

  it('крестик закрывает показ с любого слайда', () => {
    const onClose = vi.fn();
    openHowTo({ slides, texts, rulesUrl: 'x', onClose });
    click(root(), '[data-howto="next"]');
    expect(kicker()).toBe('2 из 3');
    expect(root()?.querySelector('.howto-close')?.getAttribute('aria-label')).toBe('Закрыть');
    click(root(), '[data-howto="close"]');
    expect(root()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('навигация: далее до конца, назад, «Понятно» закрывает; на последнем — ссылка на правила', () => {
    const onClose = vi.fn();
    openHowTo({ slides, texts, rulesUrl: 'https://example.test/rules', onClose });
    click(root(), '[data-howto="next"]');
    click(root(), '[data-howto="next"]');
    expect(kicker()).toBe('3 из 3');
    expect(root()?.querySelector('[data-howto="next"]')).toBeNull();
    expect(root()?.querySelector('a[href="https://example.test/rules"]')?.textContent).toBe('Полные правила');
    click(root(), '[data-howto="prev"]');
    expect(kicker()).toBe('2 из 3');
    click(root(), '[data-howto="next"]');
    click(root(), '[data-howto="done"]');
    expect(root()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Пропустить» и тап по фону закрывают; тап по тексту карточки — нет', () => {
    openHowTo({ slides, texts, rulesUrl: 'x' });
    click(root(), 'h1');
    expect(root()).not.toBeNull();
    click(root(), '[data-howto="skip"]');
    expect(root()).toBeNull();
    openHowTo({ slides, texts, rulesUrl: 'x' });
    root()!.click();
    expect(root()).toBeNull();
  });

  it('повторный вызов при открытом оверлее начинает с первого слайда в том же узле', () => {
    openHowTo({ slides, texts, rulesUrl: 'x' });
    click(root(), '[data-howto="next"]');
    openHowTo({ slides, texts, rulesUrl: 'x' });
    expect(document.querySelectorAll('#howto')).toHaveLength(1);
    expect(kicker()).toBe('1 из 3');
  });
});

describe('openHowToAsk', () => {
  const askTexts = { ask: 'Показать, как играть?', later: 'Позже', yes: 'Показать' };

  it('«Показать» вызывает onShow, «Позже» — onLater; окно закрывается', () => {
    const onShow = vi.fn();
    const onLater = vi.fn();
    openHowToAsk({ logo: '<svg class="ask-logo"></svg>', texts: askTexts, onShow, onLater });
    expect(ask()?.querySelector('.ask-logo')).not.toBeNull();
    expect(ask()?.querySelector('p')?.textContent).toBe('Показать, как играть?');
    click(ask(), '[data-howto="show"]');
    expect(ask()).toBeNull();
    expect(onShow).toHaveBeenCalledTimes(1);

    openHowToAsk({ logo: '', texts: askTexts, onShow, onLater });
    click(ask(), '[data-howto="later"]');
    expect(ask()).toBeNull();
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('тап по фону — «позже»; тап по тексту ничего не делает; повторный вызов не плодит узлы', () => {
    const onShow = vi.fn();
    const onLater = vi.fn();
    openHowToAsk({ logo: '', texts: askTexts, onShow, onLater });
    openHowToAsk({ logo: '', texts: askTexts, onShow, onLater });
    expect(document.querySelectorAll('#howto-ask')).toHaveLength(1);
    click(ask(), 'p');
    expect(ask()).not.toBeNull();
    ask()!.click();
    expect(ask()).toBeNull();
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onShow).not.toHaveBeenCalled();
  });
});

describe('кирпичики сцен', () => {
  it('sceneTile: положение, поворот стоймя, масштаб, окантовка', () => {
    expect(sceneTile(4, 3, 10, 20)).toContain('transform="translate(10 20)"');
    const v = sceneTile(4, 3, 10, 20, { vertical: true, scale: 0.5, accent: true });
    expect(v).toContain('translate(10 20) rotate(90) scale(0.5)');
    expect(v).toContain('#c9a86a');
    expect((v.match(/class="pip"/g) ?? []).length).toBe(7);
  });

  it('sceneBack: рубашка, по умолчанию масштаб 1; стоймя и с эмблемой', () => {
    expect(sceneBack(5, 6)).toContain('translate(5 6) scale(1)');
    const b = sceneBack(5, 6, { vertical: true, scale: 0.7, emblem: '<g class="emblem"/>' });
    expect(b).toContain('translate(5 6) rotate(90) scale(0.7)');
    expect(b).toContain('class="emblem"');
    expect(b).toContain('tile-back');
  });

  it('метки, стрелка, подпись', () => {
    expect(sceneEndMark(30, 40, 5)).toContain('>5</text>');
    expect((sceneClosedMark(30, 40).match(/<line /g) ?? []).length).toBe(2);
    expect(sceneArrow(0, 0, 10, 0)).toContain('marker-end="url(#howto-arr)"');
    expect(sceneLabel(1, 2, 'a < b')).toContain('text-anchor="middle"');
    expect(sceneLabel(1, 2, 'a < b')).toContain('a &lt; b');
    const dim = sceneLabel(1, 2, 'x', { anchor: 'start', dim: true });
    expect(dim).toContain('text-anchor="start"');
    expect(dim).toContain('#97a099');
  });

  it('scene: viewBox и маркер стрелки', () => {
    const s = scene(380, 170, '<g/>');
    expect(s).toContain('viewBox="0 0 380 170"');
    expect(s).toContain('id="howto-arr"');
    expect(s).toContain('<g/>');
  });
});
