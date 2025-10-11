import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lint } from '../src/tools/lint.js';
import type { LintInput } from '../src/tools/lint.js';
import { safeSpawn } from '../src/exec/spawn.js';

vi.mock('../src/exec/spawn.js', () => ({
  safeSpawn: vi.fn()
}));

const safeSpawnMock = vi.mocked(safeSpawn);

describe('lint tool', () => {
  beforeEach(() => {
    safeSpawnMock.mockReset();
  });

  it('returns normalized output with totals and rule summary', async () => {
    safeSpawnMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          filePath: 'src/foo.ts',
          messages: [
            { ruleId: 'no-unused-vars', severity: 2, message: 'Unused variable', line: 4, column: 10 },
            { ruleId: 'no-console', severity: 1, message: 'Unexpected console', line: 7, column: 2 }
          ]
        },
        {
          filePath: 'src/bar.ts',
          messages: [
            { ruleId: 'no-console', severity: 1, message: 'Unexpected console call', line: 3, column: 5 }
          ]
        }
      ]),
      stderr: '',
      exitCode: 1,
      timedOut: false
    });

    const input: LintInput = {
      cmd: 'eslint --format json'
    };

    const result = await lint(input);

    expect(safeSpawnMock).toHaveBeenCalledWith(
      'eslint',
      ['--format', 'json'],
      expect.objectContaining({
        cwd: process.cwd()
      })
    );

    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(2);
    expect(result.byFile).toEqual([
      {
        file: 'src/foo.ts',
        errors: 1,
        warnings: 1,
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 'error',
            message: 'Unused variable',
            line: 4,
            column: 10
          },
          {
            ruleId: 'no-console',
            severity: 'warning',
            message: 'Unexpected console',
            line: 7,
            column: 2
          }
        ]
      },
      {
        file: 'src/bar.ts',
        errors: 0,
        warnings: 1,
        messages: [
          {
            ruleId: 'no-console',
            severity: 'warning',
            message: 'Unexpected console call',
            line: 3,
            column: 5
          }
        ]
      }
    ]);

    expect(result.summaryByRule).toEqual([
      { ruleId: 'no-unused-vars', errors: 1, warnings: 0 },
      { ruleId: 'no-console', errors: 0, warnings: 2 }
    ]);
    expect(result.meta.tool).toBe('eslint');
    expect(result.meta.exitCode).toBe(1);
  });

  it('appends paths with package manager commands using -- separator', async () => {
    safeSpawnMock.mockResolvedValue({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
      timedOut: false
    });

    await lint({
      cmd: 'pnpm lint -f json',
      paths: ['src/foo.ts', 'src/bar.ts']
    });

    expect(safeSpawnMock).toHaveBeenCalledWith(
      'pnpm',
      ['lint', '-f', 'json', '--', 'src/foo.ts', 'src/bar.ts'],
      expect.any(Object)
    );
  });

  it('throws RUNNER_ERROR when process fails without diagnostics', async () => {
    safeSpawnMock.mockResolvedValue({
      stdout: '[]',
      stderr: 'Command failed',
      exitCode: 2,
      timedOut: false
    });

    await expect(
      lint({
        cmd: 'eslint --format json'
      })
    ).rejects.toThrow(/RUNNER_ERROR/);
  });

  it('parses ESLint output when pnpm banners are present', async () => {
    safeSpawnMock.mockResolvedValue({
      stdout: [
        '> @agents/task-mcp lint',
        '> eslint src/**/*.ts --format json',
        JSON.stringify([
          {
            filePath: 'src/a.ts',
            messages: []
          }
        ])
      ].join('\n'),
      stderr: '',
      exitCode: 0,
      timedOut: false
    });

    const result = await lint({
      cmd: 'pnpm lint -f json'
    });

    expect(result.byFile).toEqual([
      {
        file: 'src/a.ts',
        errors: 0,
        warnings: 0,
        messages: []
      }
    ]);
  });
});
