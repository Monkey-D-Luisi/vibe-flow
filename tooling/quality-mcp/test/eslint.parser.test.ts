import { describe, expect, it } from 'vitest';
import { parseEslintJson } from '../src/parsers/eslint.js';

const sampleEslintOutput = JSON.stringify(
  [
    {
      filePath: 'src/foo.ts',
      messages: [
        { ruleId: 'no-unused-vars', severity: 2, message: 'Unused variable', line: 10, column: 5 },
        { ruleId: 'no-console', severity: 1, message: 'Unexpected console', line: 15, column: 3 }
      ]
    },
    {
      filePath: 'src/bar.ts',
      messages: [
        { ruleId: null, severity: 0, message: 'Informational hint' }
      ]
    }
  ],
  null,
  2
);

describe('parseEslintJson', () => {
  it('normalizes ESLint output by file with severity mapping', () => {
    const result = parseEslintJson(sampleEslintOutput);
    expect(result).toEqual([
      {
        file: 'src/foo.ts',
        errors: 1,
        warnings: 1,
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 'error',
            message: 'Unused variable',
            line: 10,
            column: 5
          },
          {
            ruleId: 'no-console',
            severity: 'warning',
            message: 'Unexpected console',
            line: 15,
            column: 3
          }
        ]
      },
      {
        file: 'src/bar.ts',
        errors: 0,
        warnings: 0,
        messages: [
          {
            ruleId: null,
            severity: 'info',
            message: 'Informational hint'
          }
        ]
      }
    ]);
  });

  it('throws PARSE_ERROR on invalid JSON', () => {
    expect(() => parseEslintJson('not json')).toThrow(/PARSE_ERROR/);
  });

  it('throws when messages list is missing', () => {
    const malformed = JSON.stringify([{ filePath: 'src/foo.ts' }]);
    expect(() => parseEslintJson(malformed)).toThrow(/PARSE_ERROR/);
  });
});
