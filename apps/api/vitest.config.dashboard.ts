import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'src/dashboard/**/*.spec.ts',
      'test/dashboard.e2e-spec.ts',
    ],
    fileParallelism: false,
  },
});
