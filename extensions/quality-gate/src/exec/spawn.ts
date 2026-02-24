import { spawn } from 'child_process';
import { resolve, relative, isAbsolute } from 'node:path';

export interface SpawnOptions {
  cwd?: string;
  timeoutMs?: number;
  envAllow?: string[];
}

/** Shell metacharacters that enable command injection. */
const SHELL_META = /[;&|`$(){}!<>"'\\~\n\r]/;

/** Allowed command prefixes for spawn tools. Only these can be executed. */
const ALLOWED_COMMAND_PREFIXES: readonly string[] = [
  'pnpm',
  'npx',
  'npm',
  'node',
  'vitest',
  'eslint',
  'ruff',
  'tsc',
];

/**
 * Validate that a command string and its arguments do not contain shell metacharacters.
 * Also validates the command against an allowlist of safe prefixes.
 * Prevents command injection when `shell: true` is used on Windows.
 */
export function assertSafeCommand(cmd: string, args: string[] = []): void {
  const validate = (input: string, label: string): void => {
    if (SHELL_META.test(input)) {
      throw new Error(`UNSAFE_COMMAND: ${label} contains shell metacharacters: ${input}`);
    }
  };

  // Extract the base command (first token) for allowlist check
  const baseCmd = cmd.split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_COMMAND_PREFIXES.some((prefix) => baseCmd === prefix || baseCmd.endsWith(`/${prefix}`) || baseCmd.endsWith(`\\${prefix}`))) {
    throw new Error(`UNSAFE_COMMAND: command "${baseCmd}" is not in the allowed list: ${ALLOWED_COMMAND_PREFIXES.join(', ')}`);
  }

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

/**
 * Parse a command string into the executable and its arguments.
 */
export function parseCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  return { cmd, args };
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

  const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

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
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout?.on('data', (data) => {
      if (!stdoutTruncated) {
        stdout += data.toString();
        if (stdout.length > MAX_BUFFER_BYTES) {
          stdout = stdout.slice(0, MAX_BUFFER_BYTES);
          stdoutTruncated = true;
        }
      }
    });

    child.stderr?.on('data', (data) => {
      if (!stderrTruncated) {
        stderr += data.toString();
        if (stderr.length > MAX_BUFFER_BYTES) {
          stderr = stderr.slice(0, MAX_BUFFER_BYTES);
          stderrTruncated = true;
        }
      }
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
