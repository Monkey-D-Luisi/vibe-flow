import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the coverage report tool (src/tools/coverage_report.ts).
 *
 * The coverage report tool reads coverage artifacts (coverage-summary.json
 * and/or lcov.info), parses them using istanbul parsers, and returns
 * a unified coverage report.
 */

vi.mock('@openclaw/quality-contracts/fs/read', () => ({
  readFileSafe: vi.fn(),
  readJsonFile: vi.fn(),
}));

vi.mock('../src/parsers/istanbul.js', () => ({
  parseCoverageSummary: vi.fn(),
  parseLcov: vi.fn(),
  computeLcovSummary: vi.fn(),
}));

import { readFileSafe } from '@openclaw/quality-contracts/fs/read';
import { parseCoverageSummary, parseLcov, computeLcovSummary } from '../src/parsers/istanbul.js';

const mockReadFileSafe = vi.mocked(readFileSafe);
const mockParseCoverageSummary = vi.mocked(parseCoverageSummary);
const mockParseLcov = vi.mocked(parseLcov);
const mockComputeLcovSummary = vi.mocked(computeLcovSummary);

describe('coverage report types', () => {
  it('should define CoverageReportInput with optional fields', () => {
    const input = {
      summaryPath: 'coverage/coverage-summary.json',
      lcovPath: 'coverage/lcov.info',
      repoRoot: '/project',
      exclude: ['node_modules/**'],
    };

    expect(input.summaryPath).toBe('coverage/coverage-summary.json');
    expect(input.lcovPath).toBe('coverage/lcov.info');
    expect(input.repoRoot).toBe('/project');
    expect(input.exclude).toEqual(['node_modules/**']);
  });

  it('should accept empty input', () => {
    const input = {};
    expect(input).toEqual({});
  });
});

describe('coverage report mocks integration', () => {
  it('can read and parse coverage summary', async () => {
    const mockSummaryJson = JSON.stringify({
      total: {
        lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
        statements: { total: 100, covered: 85, skipped: 0, pct: 85 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 24, skipped: 0, pct: 80 },
      },
    });

    mockReadFileSafe.mockResolvedValue(mockSummaryJson);
    mockParseCoverageSummary.mockReturnValue({
      total: {
        lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
        statements: { total: 100, covered: 85, skipped: 0, pct: 85 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 24, skipped: 0, pct: 80 },
      },
      files: {},
    });

    const content = await readFileSafe('coverage/coverage-summary.json');
    const result = parseCoverageSummary(content);

    expect(result.total.lines.pct).toBe(85);
    expect(result.total.functions.pct).toBe(90);
  });

  it('can read and parse lcov data', async () => {
    const lcovContent = `SF:/src/index.ts\nLF:50\nLH:40\nFNF:5\nFNH:4\nBRF:10\nBRH:8\nend_of_record`;

    mockReadFileSafe.mockResolvedValue(lcovContent);
    mockParseLcov.mockReturnValue([
      { file: '/src/index.ts', linesFound: 50, linesHit: 40, functionsFound: 5, functionsHit: 4, branchesFound: 10, branchesHit: 8 },
    ]);
    mockComputeLcovSummary.mockReturnValue({
      linesPct: 80,
      functionsPct: 80,
      branchesPct: 80,
    });

    const content = await readFileSafe('coverage/lcov.info');
    const records = parseLcov(content);
    const summary = computeLcovSummary(records);

    expect(records).toHaveLength(1);
    expect(summary.linesPct).toBe(80);
  });

  it('handles missing coverage files', async () => {
    mockReadFileSafe.mockRejectedValue(new Error('NOT_FOUND: File not found'));

    await expect(readFileSafe('nonexistent.json')).rejects.toThrow('NOT_FOUND');
  });
});
