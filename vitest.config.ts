import { defineConfig } from 'vitest/config';

// Юнит-тесты общих модулей. Каждый модуль пакета покрыт на 100 % — строки,
// ветви, функции. Порог блокирующий: ниже 100 — модуль в пакет не попадает.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 100, statements: 100, branches: 100, functions: 100 },
    },
  },
});
