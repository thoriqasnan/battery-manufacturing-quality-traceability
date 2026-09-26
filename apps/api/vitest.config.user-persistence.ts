import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/users/**/*.integration-spec.ts'],
    fileParallelism: false,
  },
});
