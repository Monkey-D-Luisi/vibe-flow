import { describe, it, expect } from 'vitest';
import { parseCoverageSummary, parseLcov, computeLcovSummary } from '../src/parsers/istanbul.js';

describe('parseCoverageSummary', () => {
  it('parses a valid coverage-summary.json', () => {
    const input = JSON.stringify({
      total: {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        statements: { total: 120, covered: 96, skipped: 0, pct: 80 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 24, skipped: 0, pct: 80 },
      },
      '/src/index.ts': {
        lines: { total: 50, covered: 40, skipped: 0, pct: 80 },
        statements: { total: 60, covered: 48, skipped: 0, pct: 80 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 15, covered: 12, skipped: 0, pct: 80 },
      },
    });

    const result = parseCoverageSummary(input);
    expect(result.total.lines.pct).toBe(80);
    expect(result.total.functions.pct).toBe(90);
    expect(Object.keys(result.files)).toHaveLength(1);
    expect(result.files['/src/index.ts']).toBeDefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCoverageSummary('not json')).toThrow('PARSE_ERROR');
  });

  it('throws when total key is missing', () => {
    const input = JSON.stringify({
      '/src/foo.ts': {
        lines: { total: 10, covered: 10, skipped: 0, pct: 100 },
        statements: { total: 10, covered: 10, skipped: 0, pct: 100 },
        functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
        branches: { total: 4, covered: 4, skipped: 0, pct: 100 },
      },
    });

    expect(() => parseCoverageSummary(input)).toThrow('Missing "total" key');
  });

  it('separates total from file entries', () => {
    const input = JSON.stringify({
      total: {
        lines: { total: 200, covered: 150, skipped: 0, pct: 75 },
        statements: { total: 200, covered: 150, skipped: 0, pct: 75 },
        functions: { total: 40, covered: 30, skipped: 0, pct: 75 },
        branches: { total: 50, covered: 40, skipped: 0, pct: 80 },
      },
      '/a.ts': {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        statements: { total: 100, covered: 80, skipped: 0, pct: 80 },
        functions: { total: 20, covered: 16, skipped: 0, pct: 80 },
        branches: { total: 25, covered: 20, skipped: 0, pct: 80 },
      },
      '/b.ts': {
        lines: { total: 100, covered: 70, skipped: 0, pct: 70 },
        statements: { total: 100, covered: 70, skipped: 0, pct: 70 },
        functions: { total: 20, covered: 14, skipped: 0, pct: 70 },
        branches: { total: 25, covered: 20, skipped: 0, pct: 80 },
      },
    });

    const result = parseCoverageSummary(input);
    expect(Object.keys(result.files)).toHaveLength(2);
    expect(result.files['/a.ts']).toBeDefined();
    expect(result.files['/b.ts']).toBeDefined();
  });
});

describe('parseLcov', () => {
  it('parses a single lcov record', () => {
    const lcov = `SF:/src/index.ts
FNF:5
FNH:4
BRF:10
BRH:8
LF:50
LH:45
end_of_record`;

    const records = parseLcov(lcov);
    expect(records).toHaveLength(1);
    expect(records[0].file).toBe('/src/index.ts');
    expect(records[0].linesFound).toBe(50);
    expect(records[0].linesHit).toBe(45);
    expect(records[0].functionsFound).toBe(5);
    expect(records[0].functionsHit).toBe(4);
    expect(records[0].branchesFound).toBe(10);
    expect(records[0].branchesHit).toBe(8);
  });

  it('parses multiple lcov records', () => {
    const lcov = `SF:/src/a.ts
LF:10
LH:10
FNF:2
FNH:2
BRF:4
BRH:4
end_of_record
SF:/src/b.ts
LF:20
LH:15
FNF:3
FNH:2
BRF:6
BRH:4
end_of_record`;

    const records = parseLcov(lcov);
    expect(records).toHaveLength(2);
    expect(records[0].file).toBe('/src/a.ts');
    expect(records[1].file).toBe('/src/b.ts');
    expect(records[1].linesHit).toBe(15);
  });

  it('handles empty input', () => {
    const records = parseLcov('');
    expect(records).toHaveLength(0);
  });

  it('ignores lines before SF:', () => {
    const lcov = `TN:
SF:/src/index.ts
LF:10
LH:8
FNF:2
FNH:2
BRF:0
BRH:0
end_of_record`;

    const records = parseLcov(lcov);
    expect(records).toHaveLength(1);
    expect(records[0].file).toBe('/src/index.ts');
  });
});

describe('computeLcovSummary', () => {
  it('computes overall percentages', () => {
    const records = [
      { file: '/a.ts', linesFound: 100, linesHit: 80, functionsFound: 10, functionsHit: 9, branchesFound: 20, branchesHit: 16 },
      { file: '/b.ts', linesFound: 100, linesHit: 60, functionsFound: 10, functionsHit: 7, branchesFound: 20, branchesHit: 14 },
    ];

    const summary = computeLcovSummary(records);
    expect(summary.linesPct).toBe(70);
    expect(summary.functionsPct).toBe(80);
    expect(summary.branchesPct).toBe(75);
  });

  it('returns 100% when no lines found', () => {
    const records = [
      { file: '/a.ts', linesFound: 0, linesHit: 0, functionsFound: 0, functionsHit: 0, branchesFound: 0, branchesHit: 0 },
    ];

    const summary = computeLcovSummary(records);
    expect(summary.linesPct).toBe(100);
    expect(summary.functionsPct).toBe(100);
    expect(summary.branchesPct).toBe(100);
  });

  it('handles empty records', () => {
    const summary = computeLcovSummary([]);
    expect(summary.linesPct).toBe(100);
    expect(summary.functionsPct).toBe(100);
    expect(summary.branchesPct).toBe(100);
  });
});
