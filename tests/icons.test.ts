// Значки: шестерёнка как самостоятельный <svg>.
import { describe, expect, it } from 'vitest';
import { GEAR_PATH, gearSvg } from '../src/icons';

describe('gearSvg', () => {
  it('без класса — svg 24×24 с путём шестерёнки и осью', () => {
    const svg = gearSvg();
    expect(svg.startsWith('<svg viewBox="0 0 24 24"')).toBe(true);
    expect(svg).toContain(`d="${GEAR_PATH}"`);
    expect(svg).toContain('<circle cx="12" cy="12"');
    expect(svg).not.toContain('class=');
  });

  it('класс попадает на svg', () => {
    expect(gearSvg('ico')).toContain('<svg class="ico" viewBox');
  });
});
