import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VitestSummary } from '../src/parsers/vitest.js';

vi.mock('../src/exec/spawn.js', () => ({
  safeSpawn: vi.fn(),
  assertSafeCommand: vi.fn(),
  parseCommand: vi.fn(),
}));

vi.mock('../src/parsers/vitest.js', () => ({
  parseVitestOutput: vi.fn(),
}));

import { safeSpawn, assertSafeCommand, parseCommand } from '../src/exec/spawn.js';
import { parseVitestOutput } from '../src/parsers/vitest.js';
import { runTestsTool } from '../src/tools/run_tests.js';

const mockSafeSpawn = vi.mocked(safeSpawn);
const mockAssertSafeCommand = vi.mocked(assertSafeCommand);
const mockParseCommand = vi.mocked(parseCommand);
const mockParseVitestOutput = vi.mocked(parseVitestOutput);

const mockSummary: VitestSummary = {
  totalTests: 2,
  passed: 2,
  failed: 0,
  skipped: 0,
  totalDuration: 15,
  success: true,
  files: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertSafeCommand.mockImplementation(() => undefined);
  mockParseCommand.mockReturnValue({
    cmd: 'pnpm',
    args: ['vitest', 'run', '--reporter=json'],
  });
  mockSafeSpawn.mockResolvedValue({
    stdout: '{"success":true,"numTotalTests":2,"numPassedTests":2,"numFailedTests":0}',
    stderr: '',
    exitCode: 0,
    durationMs: 30,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  });
  mockParseVitestOutput.mockReturnValue(mockSummary);
});

describe('runTestsTool command validation', () => {
  it('parses default command before safety validation', async () => {
    const result = await runTestsTool({});

    expect(mockParseCommand).toHaveBeenCalledWith('pnpm vitest run --reporter=json');
    expect(mockAssertSafeCommand).toHaveBeenCalledWith('pnpm', ['vitest', 'run', '--reporter=json']);
    expect(mockSafeSpawn).toHaveBeenCalledWith(
      'pnpm',
      ['vitest', 'run', '--reporter=json'],
      expect.objectContaining({ timeoutMs: 300000 }),
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual(mockSummary);
  });

  it('rejects unsafe payloads based on parsed executable and args', async () => {
    mockParseCommand.mockReturnValue({
      cmd: 'pnpm',
      args: ['vitest', 'run;rm', '--reporter=json'],
    });
    mockAssertSafeCommand.mockImplementation(() => {
      throw new Error('UNSAFE_COMMAND: argument contains shell metacharacters: run;rm');
    });

    await expect(runTestsTool({ command: 'pnpm vitest run;rm --reporter=json' })).rejects.toThrow('UNSAFE_COMMAND');
    expect(mockSafeSpawn).not.toHaveBeenCalled();
  });
});
