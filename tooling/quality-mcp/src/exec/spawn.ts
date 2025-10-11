import { spawn } from 'child_process';

export interface SpawnOptions {
  cwd?: string;
  timeoutMs?: number;
  envAllow?: string[];
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Secure spawn wrapper with timeout and env filtering
 */
export async function safeSpawn(cmd: string, args: string[], options: SpawnOptions = {}): Promise<SpawnResult> {
  const { cwd = process.cwd(), timeoutMs = 600000, envAllow = ['NODE_ENV'] } = options;

  // Filter environment variables
  const env: Record<string, string> = {};
  const sourceEnv = process.env as Record<string, string | undefined>;
  const allowSet = new Set(envAllow.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value !== undefined && allowSet.has(key.toLowerCase())) {
      env[key] = value;
    }
  }

  if (process.platform === 'win32') {
    if (env.Path && !env.PATH) {
      env.PATH = env.Path;
    }
    if (env.PATH && !env.Path) {
      env.Path = env.PATH;
    }
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

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const durationMs = Date.now() - startTime;
        resolve({
          stdout,
          stderr,
          exitCode: -1,
          durationMs,
          timedOut: true,
        });
      } else {
        reject(err);
      }
    });
  });
}
