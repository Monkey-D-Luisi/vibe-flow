import { defineConfig } from 'vitest/config';

// Thresholds reflect initial coverage (lines/statements ~85%, branches ~70%).
// Target trajectory: raise by 5 points each quarter as coverage grows.
const COVERAGE_THRESHOLDS = {
  statements: 80,
  branches: 65,
  functions: 85,
  lines: 80,
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
      exclude: ['src/**/*.d.ts'],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
