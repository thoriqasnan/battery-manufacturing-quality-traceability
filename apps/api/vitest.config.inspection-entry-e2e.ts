import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/inspection-entry.e2e-spec.ts'],
    fileParallelism: false,
  },
});
