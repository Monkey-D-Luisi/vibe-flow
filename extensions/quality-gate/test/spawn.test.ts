import { describe, it, expect } from 'vitest';
import { safeSpawn, assertSafeCommand, assertPathContained } from '../src/exec/spawn.js';

const isWindows = process.platform === 'win32';

/**
 * Provide the minimal environment variables needed for spawning processes
 * on both Windows and Unix. On Windows, `shell: true` requires COMSPEC and
 * PATHEXT in addition to PATH/SystemRoot.
 */
const CROSS_PLATFORM_ENV = [
  'PATH',
  'Path',
  'SYSTEMROOT',
  'SystemRoot',
  'COMSPEC',
  'PATHEXT',
  'HOMEDRIVE',
  'HOMEPATH',
  'NODE_OPTIONS',
];

describe('safeSpawn', () => {
  it('runs a simple command and captures stdout', async () => {
    const result = await safeSpawn('node', ['-e', "process.stdout.write('hello')"], {
      envAllow: CROSS_PLATFORM_ENV,
    });

    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures stderr', async () => {
    const result = await safeSpawn('node', ['-e', "process.stderr.write('err')"], {
      envAllow: CROSS_PLATFORM_ENV,
    });

    expect(result.stderr).toContain('err');
    expect(result.exitCode).toBe(0);
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await safeSpawn('node', ['-e', 'process.exit(42)'], {
      envAllow: CROSS_PLATFORM_ENV,
    });

    expect(result.exitCode).toBe(42);
    expect(result.timedOut).toBe(false);
  });

  // On Windows with shell: true, AbortController termination behavior
  // differs from Unix. The process may exit with code 1 instead of
  // being properly aborted with timedOut=true.
  it.skipIf(isWindows)('handles timeout', async () => {
    const result = await safeSpawn(
      'node',
      ['-e', 'setTimeout(() => {}, 30000)'],
      {
        timeoutMs: 500,
        envAllow: CROSS_PLATFORM_ENV,
      },
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  }, 10000);

  it('handles missing commands', async () => {
    const result = await safeSpawn('nonexistent_command_xyz_12345', [], {
      envAllow: CROSS_PLATFORM_ENV,
    });

    // On Unix ENOENT gives -1, on Windows shell: true may give 1 or 9009
    expect(result.exitCode).not.toBe(0);
  });

  // On Windows with shell: true, cmd.exe interprets special characters
  // in -e arguments (curly braces, pipes, etc.), making complex inline
  // scripts unreliable. This test is skipped on Windows.
  it.skipIf(isWindows)('filters environment variables', async () => {
    process.env.TEST_SPAWN_VISIBLE = 'visible';
    process.env.TEST_SPAWN_HIDDEN = 'hidden';

    const result = await safeSpawn(
      'node',
      ['-e', "process.stdout.write(JSON.stringify({ visible: process.env.TEST_SPAWN_VISIBLE, hidden: process.env.TEST_SPAWN_HIDDEN }))"],
      {
        envAllow: [...CROSS_PLATFORM_ENV, 'TEST_SPAWN_VISIBLE'],
      },
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.visible).toBe('visible');
    expect(output.hidden).toBeUndefined();

    delete process.env.TEST_SPAWN_VISIBLE;
    delete process.env.TEST_SPAWN_HIDDEN;
  });

  it('uses cwd option', async () => {
    const result = await safeSpawn('node', ['-e', "process.stdout.write(process.cwd())"], {
      cwd: process.cwd(),
      envAllow: CROSS_PLATFORM_ENV,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  it('records duration', async () => {
    const result = await safeSpawn('node', ['-e', 'setTimeout(() => {}, 100)'], {
      envAllow: CROSS_PLATFORM_ENV,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('assertSafeCommand', () => {
  it('allows safe commands', () => {
    expect(() => assertSafeCommand('node')).not.toThrow();
    expect(() => assertSafeCommand('npx', ['vitest', 'run'])).not.toThrow();
    expect(() => assertSafeCommand('pnpm', ['test'])).not.toThrow();
  });

  it('rejects shell metacharacters in command', () => {
    expect(() => assertSafeCommand('cmd; rm -rf /')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('cmd & whoami')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('cmd | cat')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('$(whoami)')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('cmd `id`')).toThrow('UNSAFE_COMMAND');
  });

  it('rejects quotes and backslashes', () => {
    expect(() => assertSafeCommand('cmd"injection')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand("cmd'injection")).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('cmd\\injection')).toThrow('UNSAFE_COMMAND');
  });

  it('rejects newlines and carriage returns', () => {
    expect(() => assertSafeCommand('cmd\nwhoami')).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('cmd\rwhoami')).toThrow('UNSAFE_COMMAND');
  });

  it('rejects metacharacters in arguments', () => {
    expect(() => assertSafeCommand('node', ['-e', 'process.exit(0); rm -rf /'])).toThrow('UNSAFE_COMMAND');
    expect(() => assertSafeCommand('node', ['--flag', '$(whoami)'])).toThrow('UNSAFE_COMMAND');
  });

  it('allows safe arguments', () => {
    expect(() => assertSafeCommand('node', ['-e', 'console.log'])).not.toThrow();
    expect(() => assertSafeCommand('vitest', ['run', '--reporter=json'])).not.toThrow();
  });
});

describe('assertPathContained', () => {
  it('allows paths within root', () => {
    expect(() => assertPathContained('src/index.ts', '/app')).not.toThrow();
    expect(() => assertPathContained('coverage/lcov.info', '/project')).not.toThrow();
    expect(() => assertPathContained('.', '/app')).not.toThrow();
  });

  it('rejects .. traversal', () => {
    expect(() => assertPathContained('../etc/passwd', '/app')).toThrow('PATH_TRAVERSAL');
    expect(() => assertPathContained('src/../../etc/passwd', '/app')).toThrow('PATH_TRAVERSAL');
  });

  it('rejects sibling prefix bypass', () => {
    // /app/data-secret should NOT be contained in /app/data
    expect(() => assertPathContained('/app/data-secret/file', '/app/data')).toThrow('PATH_TRAVERSAL');
  });

  it('handles absolute paths within root', () => {
    expect(() => assertPathContained('/app/src/file.ts', '/app')).not.toThrow();
  });

  it('rejects absolute paths outside root', () => {
    expect(() => assertPathContained('/etc/passwd', '/app')).toThrow('PATH_TRAVERSAL');
  });
});
