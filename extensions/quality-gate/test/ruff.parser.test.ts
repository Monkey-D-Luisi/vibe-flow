import { describe, it, expect } from 'vitest';
import { parseRuffOutput, summarizeRuff } from '../src/parsers/ruff.js';

describe('parseRuffOutput', () => {
  it('parses a clean Ruff output (empty array)', () => {
    const result = parseRuffOutput('[]');
    expect(result).toHaveLength(0);
  });

  it('parses Ruff diagnostics and groups by file', () => {
    const input = JSON.stringify([
      {
        code: 'E501',
        message: 'Line too long',
        filename: '/src/main.py',
        location: { row: 10, column: 1 },
        end_location: { row: 10, column: 120 },
      },
      {
        code: 'F401',
        message: 'Unused import',
        filename: '/src/main.py',
        location: { row: 1, column: 1 },
        end_location: { row: 1, column: 20 },
      },
      {
        code: 'W291',
        message: 'Trailing whitespace',
        filename: '/src/utils.py',
        location: { row: 5, column: 10 },
        end_location: { row: 5, column: 12 },
      },
    ]);

    const result = parseRuffOutput(input);
    expect(result).toHaveLength(2);

    const mainFile = result.find((r) => r.file === '/src/main.py');
    expect(mainFile).toBeDefined();
    expect(mainFile!.messages).toHaveLength(2);
    expect(mainFile!.errors).toBe(2); // E and F codes are errors

    const utilsFile = result.find((r) => r.file === '/src/utils.py');
    expect(utilsFile).toBeDefined();
    expect(utilsFile!.messages).toHaveLength(1);
    expect(utilsFile!.warnings).toBe(1); // W codes are warnings
  });

  it('maps E/F codes to error and W codes to warning', () => {
    const input = JSON.stringify([
      { code: 'E501', message: 'err', filename: '/a.py', location: { row: 1, column: 1 }, end_location: { row: 1, column: 2 } },
      { code: 'F401', message: 'err', filename: '/b.py', location: { row: 1, column: 1 }, end_location: { row: 1, column: 2 } },
      { code: 'W291', message: 'warn', filename: '/c.py', location: { row: 1, column: 1 }, end_location: { row: 1, column: 2 } },
      { code: 'C0301', message: 'info', filename: '/d.py', location: { row: 1, column: 1 }, end_location: { row: 1, column: 2 } },
    ]);

    const result = parseRuffOutput(input);
    expect(result.find((r) => r.file === '/a.py')!.messages[0].severity).toBe('error');
    expect(result.find((r) => r.file === '/b.py')!.messages[0].severity).toBe('error');
    expect(result.find((r) => r.file === '/c.py')!.messages[0].severity).toBe('warning');
    expect(result.find((r) => r.file === '/d.py')!.messages[0].severity).toBe('info');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseRuffOutput('not json')).toThrow('PARSE_ERROR');
  });

  it('throws on non-array JSON', () => {
    expect(() => parseRuffOutput('{}')).toThrow('PARSE_ERROR');
  });

  it('includes line/column positions', () => {
    const input = JSON.stringify([
      {
        code: 'E501',
        message: 'Line too long',
        filename: '/src/main.py',
        location: { row: 42, column: 5 },
        end_location: { row: 42, column: 130 },
      },
    ]);

    const result = parseRuffOutput(input);
    expect(result[0].messages[0].line).toBe(42);
    expect(result[0].messages[0].column).toBe(5);
    expect(result[0].messages[0].endLine).toBe(42);
    expect(result[0].messages[0].endColumn).toBe(130);
  });
});

describe('summarizeRuff', () => {
  it('summarizes reports correctly', () => {
    const reports = [
      { file: '/a.py', errors: 3, warnings: 1, messages: [] },
      { file: '/b.py', errors: 0, warnings: 0, messages: [] },
      { file: '/c.py', errors: 1, warnings: 2, messages: [] },
    ];

    const summary = summarizeRuff(reports);
    expect(summary.totalErrors).toBe(4);
    expect(summary.totalWarnings).toBe(3);
    expect(summary.filesWithIssues).toBe(2);
    expect(summary.totalFiles).toBe(3);
  });

  it('returns zeros for empty input', () => {
    const summary = summarizeRuff([]);
    expect(summary.totalErrors).toBe(0);
    expect(summary.totalWarnings).toBe(0);
    expect(summary.filesWithIssues).toBe(0);
    expect(summary.totalFiles).toBe(0);
  });
});
