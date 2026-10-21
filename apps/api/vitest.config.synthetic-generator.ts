import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      'scripts/synthetic-generator-contract.spec.ts',
      'scripts/synthetic-generator-persistence.spec.ts',
    ],
  },
});
