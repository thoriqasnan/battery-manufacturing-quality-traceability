import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'src/quality/inspection-entry.spec.ts',
      'src/quality/inspection-entry.integration-spec.ts',
    ],
    fileParallelism: false,
  },
});
