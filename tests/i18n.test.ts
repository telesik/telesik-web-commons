// @vitest-environment jsdom
// Механика локализации: текущий словарь, переключение, выбор стартового языка.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_LABELS, createI18n, type LocaleInfo } from '../src/i18n';

type Code = 'ru' | 'en' | 'pt';
const dicts = { ru: { hi: 'Привет' }, en: { hi: 'Hello' }, pt: { hi: 'Olá' } };
const locales: LocaleInfo<Code>[] = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português (BR)' },
  { code: 'ru', label: 'Русский' },
];
const make = () => createI18n<Code, { hi: string }>({ dicts, locales, initial: 'ru', fallback: 'en' });

function withNavigatorLanguage(lang: string): void {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(lang);
}

afterEach(() => vi.restoreAllMocks());

describe('createI18n', () => {
  it('до setLocale — initial; setLocale меняет словарь', () => {
    const i18n = make();
    expect(i18n.getLocale()).toBe('ru');
    expect(i18n.L().hi).toBe('Привет');
    i18n.setLocale('pt');
    expect(i18n.getLocale()).toBe('pt');
    expect(i18n.L().hi).toBe('Olá');
  });

  it('у каждого экземпляра своё состояние', () => {
    const a = make();
    const b = make();
    a.setLocale('en');
    expect(b.getLocale()).toBe('ru');
  });

  it('detectLocale: сохранённая настройка берётся, если такой язык есть', () => {
    withNavigatorLanguage('en-US');
    const i18n = make();
    expect(i18n.detectLocale('pt')).toBe('pt');
    // Неизвестный код и имя из прототипа объекта — не язык.
    expect(i18n.detectLocale('xx')).toBe('en');
    expect(i18n.detectLocale('toString')).toBe('en');
  });

  it('detectLocale: язык браузера по началу кода, без учёта регистра', () => {
    const i18n = make();
    withNavigatorLanguage('pt-BR');
    expect(i18n.detectLocale()).toBe('pt');
    withNavigatorLanguage('RU');
    expect(i18n.detectLocale(null)).toBe('ru');
  });

  it('detectLocale: неподдерживаемый или пустой язык браузера — fallback', () => {
    const i18n = make();
    withNavigatorLanguage('fi-FI');
    expect(i18n.detectLocale()).toBe('en');
    withNavigatorLanguage('');
    expect(i18n.detectLocale()).toBe('en');
  });
});

describe('LOCALE_LABELS', () => {
  it('порядок списка: латиница, кириллица, CJK; коды без повторов', () => {
    expect(LOCALE_LABELS.map((l) => l.code)).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'uk', 'ja', 'ko', 'zh']);
    expect(LOCALE_LABELS.every((l) => l.label.length > 0)).toBe(true);
  });
});
