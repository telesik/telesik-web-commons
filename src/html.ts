// Экранирование текста для вставки в HTML-шаблоны интерфейса: одна функция
// на все шаблоны, все пять сущностей.
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
