import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { assertSafeCommand, safeSpawn } from '../../src/github/spawn.js';

const mockSpawn = vi.mocked(spawn);

const ORIGINAL_ENV = {
  APPDATA: process.env.APPDATA,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  USERPROFILE: process.env.USERPROFILE,
  HOME: process.env.HOME,
};

interface MockChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
}

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

describe('github spawn helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.APPDATA = ORIGINAL_ENV.APPDATA;
    process.env.LOCALAPPDATA = ORIGINAL_ENV.LOCALAPPDATA;
    process.env.USERPROFILE = ORIGINAL_ENV.USERPROFILE;
    process.env.HOME = ORIGINAL_ENV.HOME;
  });

  it('should validate allowed commands and reject shell metacharacters', () => {
    expect(() => assertSafeCommand('gh', ['pr', 'view'])).not.toThrow();
    expect(() => assertSafeCommand('bash', ['-lc', 'echo'])).toThrow(/allowed list/);
    expect(() => assertSafeCommand('gh', ['pr', 'view;rm -rf /'])).toThrow(/metacharacters/);
  });

  it('should execute safeSpawn and collect stdout/stderr', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const runPromise = safeSpawn('gh', ['pr', 'view'], { timeoutMs: 1000 });

    child.stdout.write('hello');
    child.stderr.write('warn');
    child.emit('close', 0);

    const result = await runPromise;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('warn');
    expect(result.timedOut).toBe(false);
  });

  it('should convert ENOENT process errors into a structured result', async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const runPromise = safeSpawn('gh', ['pr', 'view'], { timeoutMs: 1000 });

    const error = Object.assign(new Error('gh not found'), { code: 'ENOENT' });
    child.emit('error', error);

    const result = await runPromise;
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('gh not found');
  });

  it('should preserve gh auth environment variables required for credential lookup', async () => {
    process.env.APPDATA = 'C:\\Users\\tester\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';
    process.env.USERPROFILE = 'C:\\Users\\tester';
    process.env.HOME = 'C:\\Users\\tester';

    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);

    const runPromise = safeSpawn('gh', ['auth', 'status'], { timeoutMs: 1000 });
    child.emit('close', 0);
    await runPromise;

    const spawnOptions = mockSpawn.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(spawnOptions.env.APPDATA).toBe(process.env.APPDATA);
    expect(spawnOptions.env.LOCALAPPDATA).toBe(process.env.LOCALAPPDATA);
    expect(spawnOptions.env.USERPROFILE).toBe(process.env.USERPROFILE);
    expect(spawnOptions.env.HOME).toBe(process.env.HOME);
  });
});
