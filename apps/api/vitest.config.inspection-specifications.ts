import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'src/quality/inspection-specification*.spec.ts',
      'src/quality/inspection-specification.integration-spec.ts',
      'src/quality/inspection-specification-mutation.integration-spec.ts',
      'test/inspection-specifications.e2e-spec.ts',
    ],
    fileParallelism: false,
  },
});
