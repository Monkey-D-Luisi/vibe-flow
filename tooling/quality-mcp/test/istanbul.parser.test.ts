import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { parseCoverageSummary, parseLcovContent, normalizeToRepo } from '../src/parsers/istanbul.js';

const createTempFile = (name: string, content: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-istanbul-'));
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
};

describe('istanbul parsers', () => {
  it('parses coverage summary into ratios', async () => {
    const summaryPath = createTempFile(
      'coverage-summary.json',
      JSON.stringify(
        {
          total: {
            lines: { total: 10, covered: 8 },
            statements: { total: 12, covered: 9 },
            branches: { total: 6, covered: 3 },
            functions: { total: 4, covered: 2 }
          },
          'src/foo.ts': {
            lines: { total: 4, covered: 3 },
            statements: { total: 5, covered: 4 },
            branches: { total: 2, covered: 1 },
            functions: { total: 2, covered: 1 }
          }
        },
        null,
        2
      )
    );

    const result = await parseCoverageSummary(summaryPath);

    expect(result.total).toEqual({
      lines: 0.8,
      statements: 0.75,
      branches: 0.5,
      functions: 0.5
    });
    expect(result.files.get('src/foo.ts')).toEqual({
      lines: 0.75,
      statements: 0.8,
      branches: 0.5,
      functions: 0.5
    });
  });

  it('parses lcov content and computes ratios', () => {
    const map = parseLcovContent(
      [
        'TN:',
        'SF:/workspace/src/foo.ts',
        'LF:8',
        'LH:6',
        'BRF:2',
        'BRH:1',
        'FNF:2',
        'FNH:1',
        'end_of_record',
        ''
      ].join('\n')
    );

    const record = map.get('/workspace/src/foo.ts');
    expect(record).toEqual({
      path: '/workspace/src/foo.ts',
      lines: 0.75,
      branches: 0.5,
      functions: 0.5
    });
  });

  it('normalizes paths relative to repo root', () => {
    const repoRoot = resolve(process.cwd(), 'tmp-project-root');
    const inside = normalizeToRepo(join(repoRoot, 'src', 'foo.ts'), repoRoot);
    expect(inside).toEqual({ normalized: 'src/foo.ts', outsideRepo: false });

    const relative = normalizeToRepo('src/bar.ts', repoRoot);
    expect(relative).toEqual({ normalized: 'src/bar.ts', outsideRepo: false });

    const outsidePath = resolve(repoRoot, '..', 'other.ts');
    const outside = normalizeToRepo(outsidePath, repoRoot);
    expect(outside).toEqual({ normalized: outsidePath.replace(/\\/g, '/'), outsideRepo: true });
  });
});
