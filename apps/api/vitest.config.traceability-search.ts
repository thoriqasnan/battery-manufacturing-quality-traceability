import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'src/traceability/traceability-search-query.spec.ts',
      'test/traceability-search.e2e-spec.ts',
    ],
    fileParallelism: false,
  },
});
