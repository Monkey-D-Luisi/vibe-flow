import { describe, expect, it } from 'vitest';
import { parseRuffJson } from '../src/parsers/ruff.js';

const sampleRuffOutput = JSON.stringify(
  [
    {
      code: 'E401',
      message: 'Multiple imports on one line',
      filename: 'pkg/module.py',
      location: { row: 12, column: 1 },
      end_location: { row: 12, column: 20 }
    },
    {
      code: 'W292',
      message: 'No newline at end of file',
      filename: 'pkg/module.py',
      location: { row: 33, column: 1 }
    },
    {
      code: 'N999',
      message: 'Custom info',
      filename: 'pkg/extra.py'
    }
  ],
  null,
  2
);

describe('parseRuffJson', () => {
  it('groups Ruff diagnostics by file and maps severities', () => {
    const result = parseRuffJson(sampleRuffOutput);
    expect(result).toEqual([
      {
        file: 'pkg/module.py',
        errors: 1,
        warnings: 1,
        messages: [
          {
            ruleId: 'E401',
            severity: 'error',
            message: 'Multiple imports on one line',
            line: 12,
            column: 1,
            endLine: 12,
            endColumn: 20
          },
          {
            ruleId: 'W292',
            severity: 'warning',
            message: 'No newline at end of file',
            line: 33,
            column: 1
          }
        ]
      },
      {
        file: 'pkg/extra.py',
        errors: 0,
        warnings: 0,
        messages: [
          {
            ruleId: 'N999',
            severity: 'info',
            message: 'Custom info'
          }
        ]
      }
    ]);
  });

  it('throws PARSE_ERROR on malformed Ruff output', () => {
    expect(() => parseRuffJson('none')).toThrow(/PARSE_ERROR/);
  });
});
