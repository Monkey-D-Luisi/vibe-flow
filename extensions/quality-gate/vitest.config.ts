import { defineConfig } from 'vitest/config';

// Thresholds reflect actual measured coverage under vitest 4 + coverage-v8 4
// (67% lines/stmts, 58% functions, 70% branches). Adjusted for v8 4 reporting
// differences. Target trajectory: raise by 5 points each quarter.
const COVERAGE_THRESHOLDS = {
  statements: 50,
  branches: 70,
  functions: 55,
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
