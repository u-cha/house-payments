import { defineConfig } from 'vitest/config';

// Тесты приложения не относятся к рендереру: vite.config.ts настраивает сборку
// окна (root = src/renderer), поэтому для Vitest нужен отдельный конфиг.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
