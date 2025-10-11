import { mkdirSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { coverageReport } from '../src/tools/coverage_report.js';

const toPosix = (value: string) => value.replace(/\\/g, '/');

describe('coverageReport tool', () => {
  it('returns normalized coverage data and applies exclusions', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'quality-coverage-'));
    const summaryPath = join(repoRoot, 'coverage-summary.json');
    const lcovPath = join(repoRoot, 'lcov.info');

    const fooRel = 'src/foo.ts';
    const barAbs = join(repoRoot, 'services', 'task-mcp', 'src', 'bar.ts');
    const ignoredRel = 'services/task-mcp/src/ignored.test.ts';

    mkdirSync(join(repoRoot, 'services', 'task-mcp', 'src'), { recursive: true });
    mkdirSync(join(repoRoot, 'src'), { recursive: true });

    const summary = {
      total: {
        lines: { total: 15, covered: 13 },
        statements: { total: 15, covered: 12 },
        branches: { total: 8, covered: 6 },
        functions: { total: 5, covered: 4 }
      },
      [fooRel]: {
        lines: { total: 10, covered: 9 },
        statements: { total: 10, covered: 8 },
        branches: { total: 6, covered: 5 },
        functions: { total: 4, covered: 3 }
      },
      [toPosix(barAbs)]: {
        lines: { total: 5, covered: 4 },
        statements: { total: 5, covered: 4 },
        branches: { total: 2, covered: 2 },
        functions: { total: 1, covered: 1 }
      },
      [ignoredRel]: {
        lines: { total: 2, covered: 2 },
        statements: { total: 2, covered: 2 },
        branches: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 }
      }
    };

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

    const lcov = [
      'TN:',
      `SF:${join(repoRoot, fooRel)}`,
      'LF:10',
      'LH:9',
      'BRF:6',
      'BRH:5',
      'FNF:4',
      'FNH:3',
      'end_of_record',
      `SF:${barAbs}`,
      'LF:5',
      'LH:4',
      'BRF:2',
      'BRH:2',
      'FNF:1',
      'FNH:1',
      'end_of_record',
      ''
    ].join('\n');

    writeFileSync(lcovPath, lcov, 'utf8');

    const report = await coverageReport({
      summaryPath,
      lcovPath,
      repoRoot,
      exclude: ['**/*.test.ts']
    });

    expect(report.total).toEqual({
      lines: 13 / 15,
      statements: 12 / 15,
      branches: 6 / 8,
      functions: 4 / 5
    });

    expect(report.files).toEqual([
      {
        path: 'services/task-mcp/src/bar.ts',
        lines: 0.8,
        statements: 0.8,
        branches: 1,
        functions: 1
      },
      {
        path: 'src/foo.ts',
        lines: 0.9,
        statements: 0.8,
        branches: 5 / 6,
        functions: 0.75
      }
    ]);

    expect(report.meta).toEqual({
      source: 'istanbul',
      summaryPath: toPosix(summaryPath),
      lcovPath: toPosix(lcovPath),
      excluded: ['services/task-mcp/src/ignored.test.ts']
    });
  });

  it('falls back to coverage-final when summary is missing', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'quality-coverage-fallback-'));
    const finalPath = join(repoRoot, 'coverage-final.json');
    const summaryPath = join(repoRoot, 'coverage-summary.json');
    const lcovPath = join(repoRoot, 'lcov.info');

    const entry = (path: string, s: Record<string, number>, f: Record<string, number>, b: Record<string, number[]>) =>
      ({
        path,
        s,
        f,
        b
      } as const);

    const coverageFinal = {
      [join(repoRoot, 'src', 'foo.ts')]: entry(
        join(repoRoot, 'src', 'foo.ts'),
        { '0': 1, '1': 0 },
        { '0': 1 },
        { '0': [1, 0] }
      ),
      [join(repoRoot, 'src', 'bar.ts')]: entry(
        join(repoRoot, 'src', 'bar.ts'),
        { '0': 0, '1': 0 },
        {},
        {}
      )
    };

    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(finalPath, JSON.stringify(coverageFinal, null, 2), 'utf8');

    const report = await coverageReport({
      summaryPath,
      lcovPath,
      repoRoot,
      exclude: []
    });

    expect(report.meta?.summaryPath).toBe(toPosix(finalPath));
    expect(report.meta?.lcovPath).toBe(toPosix(lcovPath));

    expect(report.total).toEqual({
      lines: 0.25,
      statements: 0.25,
      branches: 0.5,
      functions: 1
    });
    expect(report.files).toEqual([
      {
        path: 'src/bar.ts',
        lines: 0,
        statements: 0,
        branches: 0,
        functions: 0
      },
      {
        path: 'src/foo.ts',
        lines: 0.5,
        statements: 0.5,
        branches: 0.5,
        functions: 1
      }
    ]);
  });
});
