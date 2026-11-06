import { defineConfig } from 'vitest/config';

// E2E запускает собранное приложение в Electron, поэтому у него отдельный
// конфиг и увеличенные таймауты: `pnpm test` его не подхватывает.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
