import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ['src/test/setup-i18n.ts'],
  },
});
