import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Vitest configuration for main-process unit/integration tests.
// Aliases mirror electron.vite.config.ts and tsconfig.json so tests import the
// same modules the app builds.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/index.ts', 'src/**/*.test.ts']
    }
  }
});
