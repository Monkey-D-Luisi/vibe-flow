import { defineConfig } from 'vitest/config';

const COVERAGE_THRESHOLDS = {
  statements: 45,
  branches: 70,
  functions: 50,
  lines: 45,
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/schemas/**'],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
