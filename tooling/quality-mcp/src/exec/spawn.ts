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
  for (const key of envAllow) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
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