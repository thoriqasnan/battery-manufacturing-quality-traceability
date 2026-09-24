import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/traceability/**/*.integration-spec.ts'],
    fileParallelism: false,
  },
});
