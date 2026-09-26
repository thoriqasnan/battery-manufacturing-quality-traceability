import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/auth-transport.e2e-spec.ts'],
    fileParallelism: false,
  },
});
