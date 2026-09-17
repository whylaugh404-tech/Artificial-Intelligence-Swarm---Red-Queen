import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    env: {
      REDQUEEN_STORAGE_SECRET: 'test_secret',
    },
  },
});
