import { describe, it, expect } from 'vitest';
import { parseEslintOutput, summarizeEslint } from '../src/parsers/eslint.js';

describe('parseEslintOutput', () => {
  it('parses a clean ESLint output with no issues', () => {
    const input = JSON.stringify([
      {
        filePath: '/src/index.ts',
        errorCount: 0,
        warningCount: 0,
        messages: [],
      },
    ]);

    const result = parseEslintOutput(input);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('/src/index.ts');
    expect(result[0].errors).toBe(0);
    expect(result[0].warnings).toBe(0);
    expect(result[0].messages).toHaveLength(0);
  });

  it('parses ESLint output with errors and warnings', () => {
    const input = JSON.stringify([
      {
        filePath: '/src/foo.ts',
        errorCount: 1,
        warningCount: 1,
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: "'x' is defined but never used",
            line: 10,
            column: 5,
            endLine: 10,
            endColumn: 6,
          },
          {
            ruleId: 'no-console',
            severity: 1,
            message: 'Unexpected console statement',
            line: 15,
            column: 1,
            endLine: 15,
            endColumn: 20,
          },
        ],
      },
    ]);

    const result = parseEslintOutput(input);
    expect(result).toHaveLength(1);
    expect(result[0].errors).toBe(1);
    expect(result[0].warnings).toBe(1);
    expect(result[0].messages).toHaveLength(2);
    expect(result[0].messages[0].severity).toBe('error');
    expect(result[0].messages[0].ruleId).toBe('no-unused-vars');
    expect(result[0].messages[1].severity).toBe('warning');
    expect(result[0].messages[1].ruleId).toBe('no-console');
  });

  it('maps severity 2 to error and 1 to warning', () => {
    const input = JSON.stringify([
      {
        filePath: '/src/bar.ts',
        errorCount: 1,
        warningCount: 1,
        messages: [
          { ruleId: 'a', severity: 2, message: 'err' },
          { ruleId: 'b', severity: 1, message: 'warn' },
          { ruleId: null, severity: 0, message: 'info' },
        ],
      },
    ]);

    const result = parseEslintOutput(input);
    expect(result[0].messages[0].severity).toBe('error');
    expect(result[0].messages[1].severity).toBe('warning');
    expect(result[0].messages[2].severity).toBe('info');
  });

  it('handles multiple files', () => {
    const input = JSON.stringify([
      { filePath: '/a.ts', errorCount: 1, warningCount: 0, messages: [{ ruleId: 'r', severity: 2, message: 'm' }] },
      { filePath: '/b.ts', errorCount: 0, warningCount: 0, messages: [] },
    ]);

    const result = parseEslintOutput(input);
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe('/a.ts');
    expect(result[1].file).toBe('/b.ts');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseEslintOutput('not json')).toThrow('PARSE_ERROR');
  });

  it('throws on non-array JSON', () => {
    expect(() => parseEslintOutput('{"key": "value"}')).toThrow('PARSE_ERROR');
  });
});

describe('summarizeEslint', () => {
  it('summarizes reports correctly', () => {
    const reports = [
      { file: '/a.ts', errors: 2, warnings: 1, messages: [] },
      { file: '/b.ts', errors: 0, warnings: 0, messages: [] },
      { file: '/c.ts', errors: 0, warnings: 3, messages: [] },
    ];

    const summary = summarizeEslint(reports);
    expect(summary.totalErrors).toBe(2);
    expect(summary.totalWarnings).toBe(4);
    expect(summary.filesWithIssues).toBe(2);
    expect(summary.totalFiles).toBe(3);
  });

  it('returns zeros for empty input', () => {
    const summary = summarizeEslint([]);
    expect(summary.totalErrors).toBe(0);
    expect(summary.totalWarnings).toBe(0);
    expect(summary.filesWithIssues).toBe(0);
    expect(summary.totalFiles).toBe(0);
  });
});
