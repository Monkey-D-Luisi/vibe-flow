import { spawn } from 'child_process';

export interface SpawnOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly envAllow?: string[];
}

const SHELL_META = /[;&|`$(){}!<>"'\\~\n\r]/;

const ALLOWED_COMMAND_PREFIXES: readonly string[] = [
  'gh',
];

export function assertSafeCommand(cmd: string, args: string[] = []): void {
  const validate = (input: string, label: string): void => {
    if (SHELL_META.test(input)) {
      throw new Error(`UNSAFE_COMMAND: ${label} contains shell metacharacters: ${input}`);
    }
  };

  const baseCmd = cmd.toLowerCase();
  if (!ALLOWED_COMMAND_PREFIXES.some((prefix) => baseCmd === prefix)) {
    throw new Error(
      `UNSAFE_COMMAND: command "${baseCmd}" is not in the allowed list: ${ALLOWED_COMMAND_PREFIXES.join(', ')}`,
    );
  }

  validate(cmd, 'command');
  for (const arg of args) {
    validate(arg, 'argument');
  }
}

export interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
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

function includeIfPresent(
  source: Record<string, string | undefined>,
  target: Record<string, string>,
  key: string,
): void {
  const value = source[key];
  if (value !== undefined) {
    target[key] = value;
  }
}

const REQUIRED_RUNTIME_ENV_KEYS: readonly string[] = [
  'PATH',
  'Path',
  'SystemRoot',
  'ComSpec',
  // Preserve gh auth/config discovery across platforms.
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'GH_CONFIG_DIR',
];

export async function safeSpawn(
  cmd: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  const {
    cwd = process.cwd(),
    timeoutMs = 30_000,
    envAllow = ['NODE_ENV', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST'],
  } = options;

  const sourceEnv = process.env as Record<string, string | undefined>;
  const env: Record<string, string> = {};
  const allowSet = new Set(envAllow.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value !== undefined && allowSet.has(key.toLowerCase())) {
      env[key] = value;
    }
  }

  for (const key of REQUIRED_RUNTIME_ENV_KEYS) {
    includeIfPresent(sourceEnv, env, key);
  }

  if (process.platform === 'win32') {
    normalizeWindowsPathEnv(env);
  }

  const startTime = Date.now();
  let timedOut = false;
  const MAX_BUFFER_BYTES = 1 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout?.on('data', (chunk) => {
      if (stdoutTruncated) {
        return;
      }
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout, 'utf8') > MAX_BUFFER_BYTES) {
        stdout = stdout.slice(0, MAX_BUFFER_BYTES);
        stdoutTruncated = true;
      }
    });

    child.stderr?.on('data', (chunk) => {
      if (stderrTruncated) {
        return;
      }
      stderr += chunk.toString();
      if (Buffer.byteLength(stderr, 'utf8') > MAX_BUFFER_BYTES) {
        stderr = stderr.slice(0, MAX_BUFFER_BYTES);
        stderrTruncated = true;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        durationMs: Date.now() - startTime,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
      });
    });

    child.on('error', (error: NodeJS.ErrnoException & { name?: string }) => {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        resolve({
          stdout,
          stderr,
          exitCode: -1,
          durationMs: Date.now() - startTime,
          timedOut: true,
          stdoutTruncated,
          stderrTruncated,
        });
        return;
      }
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
        if (!stderr) {
          stderr = error.message;
        }
        resolve({
          stdout,
          stderr,
          exitCode: -1,
          durationMs: Date.now() - startTime,
          timedOut,
          stdoutTruncated,
          stderrTruncated,
        });
        return;
      }
      reject(error);
    });
  });
}
