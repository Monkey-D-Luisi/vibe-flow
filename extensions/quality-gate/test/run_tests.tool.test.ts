import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnResult } from '../src/exec/spawn.js';
import * as spawnModule from '../src/exec/spawn.js';
import { runTestsTool } from '../src/tools/run_tests.js';

function createSpawnResult(overrides: Partial<SpawnResult> = {}): SpawnResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    durationMs: 30,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('runTestsTool behavior', () => {
  it('runs the default command and parses vitest JSON output', async () => {
    const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout:
          'Vitest v2\n' +
          '{"success":true,"numTotalTests":3,"numPassedTests":3,"numFailedTests":0,"numPendingTests":0}',
      }),
    );

    const result = await runTestsTool({});

    expect(safeSpawnSpy).toHaveBeenCalledWith(
      'pnpm',
      ['vitest', 'run', '--reporter=json'],
      expect.objectContaining({ timeoutMs: 300000 }),
    );
    expect(result.command).toBe('pnpm vitest run --reporter=json');
    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      totalTests: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      success: true,
    });
    expect(result.stdout).toBeUndefined();
  });

  it('marks result as timed out when process times out', async () => {
    vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        timedOut: true,
        exitCode: -1,
        durationMs: 5000,
        stderr: 'ABORT_ERR',
      }),
    );

    const result = await runTestsTool({ timeoutMs: 5000 });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toBe('Test execution timed out');
    expect(result.summary).toBeUndefined();
  });

  it('falls back to raw output when vitest JSON is malformed', async () => {
    vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout: 'this is not json output',
      }),
    );

    const result = await runTestsTool({});

    expect(result.success).toBe(true);
    expect(result.summary).toBeUndefined();
    expect(result.stdout).toBe('this is not json output');
  });

  it('returns raw output when reporter is set to raw', async () => {
    vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue(
      createSpawnResult({
        stdout: '{"success":false,"numTotalTests":2,"numPassedTests":1,"numFailedTests":1}',
        exitCode: 1,
      }),
    );

    const result = await runTestsTool({ reporter: 'raw' });

    expect(result.summary).toBeUndefined();
    expect(result.success).toBe(false);
    expect(result.stdout).toContain('"numFailedTests":1');
  });

  it('rejects unsafe commands before execution', async () => {
    const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn');

    await expect(runTestsTool({ command: 'pnpm vitest run;rm --reporter=json' })).rejects.toThrow('UNSAFE_COMMAND');
    expect(safeSpawnSpy).not.toHaveBeenCalled();
  });
});
