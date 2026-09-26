import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/auth/**/*.spec.ts', 'src/auth/**/*.integration-spec.ts'],
    fileParallelism: false,
  },
});
