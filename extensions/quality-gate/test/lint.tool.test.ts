import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedLintFileReport } from '../src/parsers/types.js';

vi.mock('../src/exec/spawn.js', () => ({
  safeSpawn: vi.fn(),
  assertSafeCommand: vi.fn(),
  parseCommand: vi.fn(),
}));

vi.mock('../src/parsers/eslint.js', () => ({
  parseEslintOutput: vi.fn(),
  summarizeEslint: vi.fn(),
}));

vi.mock('../src/parsers/ruff.js', () => ({
  parseRuffOutput: vi.fn(),
  summarizeRuff: vi.fn(),
}));

import { safeSpawn, assertSafeCommand, parseCommand } from '../src/exec/spawn.js';
import { parseEslintOutput, summarizeEslint } from '../src/parsers/eslint.js';
import { parseRuffOutput, summarizeRuff } from '../src/parsers/ruff.js';
import { lintTool } from '../src/tools/lint.js';

const mockSafeSpawn = vi.mocked(safeSpawn);
const mockAssertSafeCommand = vi.mocked(assertSafeCommand);
const mockParseCommand = vi.mocked(parseCommand);
const mockParseEslint = vi.mocked(parseEslintOutput);
const mockSummarizeEslint = vi.mocked(summarizeEslint);
const mockParseRuff = vi.mocked(parseRuffOutput);
const mockSummarizeRuff = vi.mocked(summarizeRuff);

const emptySpawnResult = {
  stdout: '[]',
  stderr: '',
  exitCode: 0,
  durationMs: 50,
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
};

const sampleReport: NormalizedLintFileReport[] = [
  {
    file: 'src/example.ts',
    errors: 0,
    warnings: 0,
    messages: [],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertSafeCommand.mockImplementation(() => undefined);
  mockSafeSpawn.mockResolvedValue(emptySpawnResult);
  mockParseEslint.mockReturnValue(sampleReport);
  mockSummarizeEslint.mockReturnValue({
    totalErrors: 0,
    totalWarnings: 0,
    filesWithIssues: 0,
    totalFiles: 1,
  });
  mockParseRuff.mockReturnValue(sampleReport);
  mockSummarizeRuff.mockReturnValue({
    totalErrors: 0,
    totalWarnings: 0,
    filesWithIssues: 0,
    totalFiles: 1,
  });
});

describe('lintTool command validation', () => {
  it('parses default eslint command before safety validation', async () => {
    mockParseCommand.mockReturnValue({
      cmd: 'pnpm',
      args: ['lint', '-f', 'json'],
    });

    const result = await lintTool({});

    expect(mockParseCommand).toHaveBeenCalledWith('pnpm lint -f json');
    expect(mockAssertSafeCommand).toHaveBeenCalledWith('pnpm', ['lint', '-f', 'json']);
    expect(mockSafeSpawn).toHaveBeenCalledWith(
      'pnpm',
      ['lint', '-f', 'json'],
      expect.objectContaining({ timeoutMs: 120000 }),
    );
    expect(result.command).toBe('pnpm lint -f json');
  });

  it('parses default ruff command before safety validation', async () => {
    mockParseCommand.mockReturnValue({
      cmd: 'ruff',
      args: ['check', '--output-format', 'json', '.'],
    });

    const result = await lintTool({ engine: 'ruff' });

    expect(mockParseCommand).toHaveBeenCalledWith('ruff check --output-format json .');
    expect(mockAssertSafeCommand).toHaveBeenCalledWith('ruff', ['check', '--output-format', 'json', '.']);
    expect(mockSafeSpawn).toHaveBeenCalledWith(
      'ruff',
      ['check', '--output-format', 'json', '.'],
      expect.objectContaining({ timeoutMs: 120000 }),
    );
    expect(result.engine).toBe('ruff');
  });

  it('rejects unsafe payloads based on parsed executable and args', async () => {
    mockParseCommand.mockReturnValue({
      cmd: 'pnpm',
      args: ['lint;rm', '-f', 'json'],
    });
    mockAssertSafeCommand.mockImplementation(() => {
      throw new Error('UNSAFE_COMMAND: argument contains shell metacharacters: lint;rm');
    });

    await expect(lintTool({ command: 'pnpm lint;rm -f json' })).rejects.toThrow('UNSAFE_COMMAND');
    expect(mockSafeSpawn).not.toHaveBeenCalled();
  });
});
