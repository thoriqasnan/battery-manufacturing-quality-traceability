import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'scripts/synthetic-generator-persistence.integration-spec.ts',
      'scripts/synthetic-generator-quality.integration-spec.ts',
      'scripts/synthetic-generator-nc.integration-spec.ts',
    ],
    fileParallelism: false,
  },
});
