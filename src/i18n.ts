// Механика локализации интерфейса. Словари, набор языков и первичный язык —
// у игры: пакет переводов не хранит. Первичный словарь задаёт тип, остальные
// обязаны совпадать с ним по ключам (проверяет компилятор у потребителя:
// `Record<Code, Dict>`).

export interface LocaleInfo<Code extends string> {
  readonly code: Code;
  /** Автоним языка для списка выбора. */
  readonly label: string;
}

/**
 * Автонимы языков студии. Порядок списка выбора: автонимы по алфавиту —
 * сначала латиница, затем кириллица, затем остальные письменности; для CJK —
 * порядок кодов ISO (ja, ko, zh). Новый язык вставлять по этому правилу.
 */
export const LOCALE_LABELS = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português (BR)' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
] as const satisfies ReadonlyArray<LocaleInfo<string>>;

export interface I18nOptions<Code extends string, Dict> {
  /** Словари по коду языка. */
  readonly dicts: Readonly<Record<Code, Dict>>;
  /** Языки в порядке списка выбора. */
  readonly locales: ReadonlyArray<LocaleInfo<Code>>;
  /** Язык до первого setLocale. */
  readonly initial: Code;
  /** Язык для браузеров с неподдерживаемым языком. */
  readonly fallback: Code;
}

export interface I18n<Code extends string, Dict> {
  /** Текущий словарь. */
  L(): Dict;
  getLocale(): Code;
  setLocale(locale: Code): void;
  /**
   * Стартовый язык: сохранённая настройка, если такой язык есть; иначе язык
   * браузера по началу кода (`pt-BR` → `pt`); иначе fallback.
   */
  detectLocale(preferred?: string | null): Code;
}

export function createI18n<Code extends string, Dict>(opts: I18nOptions<Code, Dict>): I18n<Code, Dict> {
  let current = opts.initial;
  return {
    L: () => opts.dicts[current],
    getLocale: () => current,
    setLocale: (locale) => {
      current = locale;
    },
    detectLocale: (preferred) => {
      if (preferred && Object.hasOwn(opts.dicts, preferred)) return preferred as Code;
      const nav = (navigator.language || opts.fallback).toLowerCase();
      for (const { code } of opts.locales) {
        if (nav.startsWith(code)) return code;
      }
      return opts.fallback;
    },
  };
}
