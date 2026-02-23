import { spawn } from 'child_process';
import { resolve, relative, isAbsolute } from 'node:path';

export interface SpawnOptions {
  cwd?: string;
  timeoutMs?: number;
  envAllow?: string[];
}

/** Shell metacharacters that enable command injection. */
const SHELL_META = /[;&|`$(){}!<>"'\\~\n\r]/;

/**
 * Validate that a command string and its arguments do not contain shell metacharacters.
 * Prevents command injection when `shell: true` is used on Windows.
 */
export function assertSafeCommand(cmd: string, args: string[] = []): void {
  const validate = (input: string, label: string): void => {
    if (SHELL_META.test(input)) {
      throw new Error(`UNSAFE_COMMAND: ${label} contains shell metacharacters: ${input}`);
    }
  };
  validate(cmd, 'command');
  for (const arg of args) {
    validate(arg, 'argument');
  }
}

/**
 * Validate that a path is contained within the given root directory.
 * Prevents path traversal attacks via `..` sequences or absolute paths.
 * Uses path.relative to avoid sibling-prefix bypass (e.g. /root/dir2 vs /root/dir).
 */
export function assertPathContained(inputPath: string, root: string): void {
  const rootAbs = resolve(root);
  const candidateAbs = resolve(rootAbs, inputPath);
  const rel = relative(rootAbs, candidateAbs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`PATH_TRAVERSAL: path escapes root directory: ${inputPath}`);
  }
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

function normalizeWindowsPathEnv(env: Record<string, string>): void {
  const pathMixed = env.Path;
  const pathUpper = env.PATH;
  if (pathMixed && !pathUpper) {
    env.PATH = pathMixed;
  } else if (pathUpper && !pathMixed) {
    env.Path = pathUpper;
  }
}

export async function safeSpawn(cmd: string, args: string[], options: SpawnOptions = {}): Promise<SpawnResult> {
  const { cwd = process.cwd(), timeoutMs = 600000, envAllow = ['NODE_ENV'] } = options;

  const env: Record<string, string> = {};
  const sourceEnv = process.env as Record<string, string | undefined>;
  const allowSet = new Set(envAllow.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value !== undefined && allowSet.has(key.toLowerCase())) {
      env[key] = value;
    }
  }

  if (process.platform === 'win32') {
    normalizeWindowsPathEnv(env);
  }

  const startTime = Date.now();
  let timedOut = false;

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;

    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        durationMs,
        timedOut,
      });
    });

    child.on('error', (err: NodeJS.ErrnoException & { name?: string }) => {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        const durationMs = Date.now() - startTime;
        resolve({
          stdout,
          stderr,
          exitCode: -1,
          durationMs,
          timedOut: true,
        });
      } else if (err?.code === 'ENOENT' || err?.code === 'EACCES') {
        const durationMs = Date.now() - startTime;
        if (!stderr) {
          stderr = err.message;
        }
        resolve({
          stdout,
          stderr,
          exitCode: -1,
          durationMs,
          timedOut,
        });
      } else {
        reject(err);
      }
    });
  });
}
