import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveWorker(): { command: string; args: string[] } {
  // Always use tsx because worker imports .ts tool files
  // Use absolute path to worker
  const workerPath = resolve(__dirname, 'worker.js');
  // Calculate workspace root from dist/ (4 levels up: dist -> server -> quality-mcp -> tooling -> workspace)
  const workspaceRoot = resolve(__dirname, '../../../..');
  // Use node directly with tsx CLI module from workspace root
  const tsxCli = resolve(workspaceRoot, 'node_modules/tsx/dist/cli.mjs');
  return { 
    command: process.execPath,
    args: [tsxCli, workerPath] 
  };
}

function buildEnv(): NodeJS.ProcessEnv {
  const allow = new Set([
    'NODE_ENV',
    'PATH',
    'Path',
    'PNPM_HOME',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'COMSPEC',
    'HOME',
    'TMP',
    'TEMP',
    'APPDATA',
    'LOCALAPPDATA'
  ]);
  const filtered: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allow.has(key) && value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export interface ExecuteOptions {
  timeoutMs?: number;
  requestId: string;
}

interface WorkerResponse {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export async function invokeTool(tool: string, input: unknown, options: ExecuteOptions): Promise<unknown> {
  const { command, args } = resolveWorker();
  const timeoutMs = options.timeoutMs ?? config.defaultTimeoutMs;
  const env = buildEnv();
  
  // Find workspace root (4 levels up from dist/)
  const workspaceRoot = resolve(__dirname, '../../../..');
  
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    cwd: workspaceRoot // Ensure worker runs from workspace root
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let finished = false;

  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const payload = JSON.stringify({ tool, input });
  child.stdin.write(payload);
  child.stdin.end();

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    if (finished) {
      return;
    }
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  const [code, signal] = await once(child, 'close') as [number | null, NodeJS.Signals | null];
  finished = true;
  clearTimeout(timeoutHandle);

  if (timedOut) {
    throw Object.assign(new Error('TIMEOUT: Tool execution exceeded limit'), { code: 'TIMEOUT' });
  }
  if (code !== 0 && stdoutChunks.length === 0) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    throw Object.assign(new Error(stderr || 'Worker process failed'), { code: 'RUNNER_ERROR' });
  }

  let parsed: WorkerResponse;
  try {
    parsed = JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as WorkerResponse;
  } catch (error) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    throw Object.assign(new Error(`Invalid worker response: ${(error as Error).message}`), {
      code: 'PARSE_ERROR',
      detail: stderr
    });
  }

  if (!parsed.ok) {
    const codeName = parsed.error?.code ?? 'RUNNER_ERROR';
    const message = parsed.error?.message ?? 'Unknown worker error';
    throw Object.assign(new Error(message), { code: codeName });
  }

  return parsed.result;
}
