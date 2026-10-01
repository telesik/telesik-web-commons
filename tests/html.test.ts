// Экранирование HTML: одна функция на все шаблоны, все пять сущностей.
import { describe, expect, it } from 'vitest';
import { esc } from '../src/html';

describe('esc', () => {
  it('экранирует & < > " и апостроф, остальное не трогает', () => {
    expect(esc(`<b class="x">Tom & Jerry's</b>`)).toBe('&lt;b class=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/b&gt;');
    expect(esc('Вася — 12:3')).toBe('Вася — 12:3');
    expect(esc('')).toBe('');
  });
});
