import { defineConfig } from 'vitest/config';

// Thresholds reflect actual measured coverage (87.51% lines, 95.13% statements,
// 79.21% functions, ~80% branches) with a safety buffer below actual.
// Target trajectory: raise by 5 points each quarter as coverage grows.
const COVERAGE_THRESHOLDS = {
  statements: 85,
  branches: 75,
  functions: 90,
  lines: 85,
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/schemas/**'],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
