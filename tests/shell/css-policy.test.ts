// CSS-политики общей таблицы стилей shell.css. Здесь ДВЕ независимые политики
// на общем парсере:
// 1) выделение текста: долгое касание по столу — жест
//    прицеливания, а не выделение, iOS же выделял SVG-подписи стола (цифры
//    концов, бейдж базара) и поднимал меню Copy / Look Up поверх поля.
//    Лекарство — глобальный запрет на body плюс точечные разрешения тому,
//    что игрок копирует осознанно;
// 2) кегль фокусируемых контролов: всё, что iOS зумит
//    при фокусе (select/input/textarea), держит ≥16px; мелкий кегль —
//    только по белому списку нефокусируемого.
// Правила живут в shell.css и легко теряются при рефакторинге стилей —
// тесты держат сами инварианты политик.
// Каскад браузера jsdom не считает (стили он не применяет) — живое
// поведение проверяется в браузере.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Файл читается напрямую (не vite-импортом `?raw`: vitest по умолчанию
// не гоняет CSS через пайплайн и отдаёт пустышку); путь — от module URL,
// без node:path и __dirname — типов node в tsconfig нет (см. node-types.d.ts).
const css = readFileSync(new URL('../../src/shell/shell.css', import.meta.url), 'utf8');

interface Rule {
  selectors: string[];
  decl: string;
}

/** Правила верхнего уровня «селекторы { декларации }»; @-блоки (media
 *  и прочие) пропускаются целиком — политика объявлена на верхнем уровне. */
function topLevelRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    // Тело с учётом вложенности: у @media внутри свои блоки.
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    if (!head.startsWith('@')) {
      rules.push({
        selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
        decl: text.slice(open + 1, j - 1),
      });
    }
    i = j;
  }
  return rules;
}

const rules = topLevelRules(css);

/** Листовые правила «селекторы { декларации }» по всему файлу, включая
 *  внутренности @media: политика кегля действует и там. */
function leafRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  let i = 0;
  let headStart = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const head = text.slice(headStart, i).trim();
      if (head.startsWith('@')) {
        headStart = i + 1; // войти внутрь @-блока, его правила тоже листовые
      } else {
        const close = text.indexOf('}', i + 1); // в листовом теле '{' не бывает
        out.push({
          selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
          decl: text.slice(i + 1, close < 0 ? text.length : close),
        });
        i = close < 0 ? text.length : close;
        headStart = i + 1;
      }
    } else if (ch === '}') {
      headStart = i + 1; // закрылся @-блок
    }
    i++;
  }
  return out;
}
const has = (decl: string, prop: string, value: string): boolean =>
  new RegExp(`(^|[;\\s])${prop.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\s*:\\s*${value}\\b`).test(
    decl,
  );

describe('политика выделения текста', () => {
  it('запрет объявлен на body: user-select и touch-callout', () => {
    const body = rules.find(
      (r) => r.selectors.includes('body') && has(r.decl, 'user-select', 'none'),
    );
    expect(body, 'на body нет запрета user-select: none').toBeTruthy();
    expect(has(body!.decl, '-webkit-user-select', 'none')).toBe(true);
    expect(has(body!.decl, '-webkit-touch-callout', 'none')).toBe(true);
  });

  it('исключения: поля ввода и то, что игрок копирует осознанно', () => {
    const allow = rules.find(
      (r) => has(r.decl, 'user-select', 'text') && r.selectors.includes('input'),
    );
    expect(allow, 'нет разрешающего правила user-select: text с input').toBeTruthy();
    // Поля ввода — iOS без явного text не даёт в них ни курсора, ни
    // выделения; остальное — строка версии (карточка и бейдж), тексты
    // настроек, счётчик позиции истории.
    for (const sel of [
      'input',
      '#version-badge',
      '.card .version-line',
      '#settings .card',
      '#history-bar .replay-pos',
    ]) {
      expect(allow!.selectors, `в исключениях нет «${sel}»`).toContain(sel);
    }
    expect(has(allow!.decl, '-webkit-user-select', 'text')).toBe(true);
  });
});

describe('политика кегля фокусируемых контролов', () => {
  it('в одном блоке нет двух объявлений font-size — дубль всегда ошибка каскада', () => {
    // Листовые тела блоков по всему файлу, включая внутренности @media:
    // второе объявление молча побеждает первое — так 13px отменил
    // 16px у селекта истории.
    const bodies = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{[^{}]*\}/g) ?? [];
    const dups = bodies.filter((b) => (b.match(/font-size\s*:/g) ?? []).length > 1);
    expect(dups, `блоки с дублем font-size:\n${dups.join('\n---\n')}`).toEqual([]);
  });

  it('кегль меньше 16px (или не px-литерал) — только по белому списку', () => {
    // Default-deny: контрол опознаётся не по тегу в селекторе (мимо регекса
    // прошёл бы класс вроде .lang-select — три настоящих <select>, чья
    // специфичность бьёт страховку `select { 16px }`), а наоборот — каждый
    // мелкий кегль обязан быть в списке заведомо НЕфокусируемого. Новый
    // селектор с < 16px требует явного решения здесь. Смотрятся все
    // листовые правила файла, включая @media. Ограничение: только явные
    // объявления — контрол без своего font-size, наследующий мелкий кегль
    // контейнера, тест не ловит (живое поведение — за превью).
    // Текст, бейджи, подписи и кнопки (<button> iOS при фокусе не зумит).
    // Сюда НЕЛЬЗЯ вносить селекторы, накрывающие select/input/textarea.
    const SMALL_OK = new Set<string>([
      'body',
      '.round-chip',
      '.status-event',
      '.status-prompt',
      '.first-chip',
      '.total-chip',
      '.hand-sum',
      '.hand-name',
      '.replay-pos',
      '.pile-count',
      '#toast',
      // Тост «спасибо» tip jar платформенной надстройки: не фокусируется.
      '.tip-jar-toast',
      '#tutor-bar',
      '#version-badge',
      '.card .sub',
      '.card .version-line',
      '.field label',
      '.check',
      '.btn',
      '.icon-btn',
      '.confirm-q',
      '.confirm-btn',
      '.lot-side',
      '.lot-result',
      '.result-pts',
      '.result-note',
      '.match-round',
      // «Как играть»: подпись-кикер и кнопка-призрак «Пропустить»
      '.howto-kicker',
      '.howto-ghost',
      // Итоги раунда: «Бросить матч / История ходов» одним
      // рядом без переносов — на узких экранах 12px; это <button>, не поле.
      '.btn-row.review-row > .btn',
      "[data-tip]:hover::after",
    ]);
    const bad: string[] = [];
    for (const r of leafRules(css)) {
      for (const m of r.decl.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
        const v = m[1]!.trim();
        const px = /^([\d.]+)px$/.exec(v);
        if (px && Number(px[1]) >= 16) continue; // ≥16px — всегда можно
        for (const sel of r.selectors) {
          if (!SMALL_OK.has(sel)) bad.push(`${sel} → font-size: ${v}`);
        }
      }
    }
    expect(
      bad,
      `мелкий или нестандартный кегль вне белого списка (фокусируемый контрол?):\n${bad.join('\n')}`,
    ).toEqual([]);
  });
});
