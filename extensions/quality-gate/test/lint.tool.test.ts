import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnResult } from '@openclaw/quality-contracts/exec/spawn';
import * as spawnModule from '@openclaw/quality-contracts/exec/spawn';
import { lintTool } from '../src/tools/lint.js';

function createSpawnResult(overrides: Partial<SpawnResult> = {}): SpawnResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    durationMs: 40,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('lintTool behavior', () => {
  it('parses eslint JSON output from the default command path', async () => {
    const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout:
          'ESLint 8.57.0\n' +
          JSON.stringify([
            {
              filePath: 'src/example.ts',
              errorCount: 1,
              warningCount: 1,
              messages: [
                {
                  ruleId: 'no-undef',
                  severity: 2,
                  message: 'foo is not defined',
                  line: 2,
                  column: 1,
                  endLine: 2,
                  endColumn: 4,
                },
                {
                  ruleId: 'no-console',
                  severity: 1,
                  message: 'Unexpected console statement',
                  line: 3,
                  column: 1,
                  endLine: 3,
                  endColumn: 8,
                },
              ],
            },
            {
              filePath: 'src/clean.ts',
              errorCount: 0,
              warningCount: 0,
              messages: [],
            },
          ]),
      }),
    );

    const result = await lintTool({});

    expect(safeSpawnSpy).toHaveBeenCalledWith(
      'pnpm',
      ['lint', '-f', 'json'],
      expect.objectContaining({ timeoutMs: 120000 }),
    );
    expect(result.command).toBe('pnpm lint -f json');
    expect(result.totalErrors).toBe(1);
    expect(result.totalWarnings).toBe(1);
    expect(result.filesWithIssues).toBe(1);
    expect(result.totalFiles).toBe(2);
    expect(result.reports[0]?.messages[0]?.severity).toBe('error');
    expect(result.reports[0]?.messages[1]?.severity).toBe('warning');
    expect(result.raw).toBeUndefined();
  });

  it('parses ruff diagnostics with grouped file summaries', async () => {
    vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout: JSON.stringify([
          {
            code: 'F401',
            message: 'unused import',
            filename: 'src/app.py',
            location: { row: 1, column: 1 },
            end_location: { row: 1, column: 5 },
          },
          {
            code: 'W291',
            message: 'trailing whitespace',
            filename: 'src/app.py',
            location: { row: 2, column: 5 },
            end_location: { row: 2, column: 6 },
          },
          {
            code: 'E501',
            message: 'line too long',
            filename: 'src/other.py',
            location: { row: 4, column: 1 },
            end_location: { row: 4, column: 99 },
          },
        ]),
      }),
    );

    const result = await lintTool({ engine: 'ruff' });

    expect(result.engine).toBe('ruff');
    expect(result.command).toBe('ruff check --output-format json .');
    expect(result.totalErrors).toBe(2);
    expect(result.totalWarnings).toBe(1);
    expect(result.filesWithIssues).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect(result.reports.find((report) => report.file === 'src/app.py')?.messages).toHaveLength(2);
  });

  it('falls back to raw output when lint output is not parseable JSON', async () => {
    vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout: 'this is not parseable json',
        stderr: 'lint failed: formatter crashed',
        exitCode: 2,
      }),
    );

    const result = await lintTool({});

    expect(result.totalErrors).toBe(0);
    expect(result.totalWarnings).toBe(0);
    expect(result.reports).toHaveLength(0);
    expect(result.raw).toContain('this is not parseable json');
    expect(result.raw).toContain('stderr: lint failed: formatter crashed');
    expect(result.exitCode).toBe(2);
  });

  it('rejects unsafe commands before process execution', async () => {
    const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn');

    await expect(lintTool({ command: 'pnpm lint;rm -f json' })).rejects.toThrow('UNSAFE_COMMAND');
    expect(safeSpawnSpy).not.toHaveBeenCalled();
  });
});
