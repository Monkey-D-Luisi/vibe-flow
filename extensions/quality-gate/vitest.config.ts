import { defineConfig } from 'vitest/config';

// Thresholds reflect actual measured coverage (61.36% lines/stmts, 63.15% functions,
// 81.7% branches) with a safety buffer below actual after Task 0027 coverage work.
// Target trajectory: raise by 5 points each quarter as coverage grows.
const COVERAGE_THRESHOLDS = {
  statements: 50,
  branches: 75,
  functions: 60,
  lines: 50,
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
