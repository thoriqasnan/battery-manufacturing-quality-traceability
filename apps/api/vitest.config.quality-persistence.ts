import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/quality/**/*.integration-spec.ts'],
    fileParallelism: false,
  },
});
