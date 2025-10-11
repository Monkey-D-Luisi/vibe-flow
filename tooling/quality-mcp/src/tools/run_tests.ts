import Ajv from 'ajv/dist/2020.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';
import { safeSpawn } from '../exec/spawn.js';
import { parseVitestOutput } from '../parsers/vitest.js';

export interface RunTestsInput {
  cwd?: string;
  cmd?: string;
  timeoutMs?: number;
  envAllow?: string[];
}

export interface RunTestsOutput {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  failedTests: string[];
  meta: {
    runner: string;
    cmd: string;
    cwd: string;
    exitCode: number;
  };
}

const ajv = new Ajv({ allErrors: true });

const inputSchema = loadSchema('quality_tests.input.schema.json');
const outputSchema = loadSchema('quality_tests.output.schema.json');

const validateInput = ajv.compile(inputSchema);
const validateOutput = ajv.compile(outputSchema);

/**
 * Parse command string into command and args
 */
function parseCommand(cmd: string): { command: string; args: string[] } {
  // NOTE: this intentionally keeps a naive split; callers with spaces should set cmd/args explicitly.
  const parts = cmd.split(' ');
  return {
    command: parts[0],
    args: parts.slice(1),
  };
}

/**
 * Detect test runner from command
 */
function detectRunner(cmd: string): string {
  if (cmd.includes('vitest')) {
    return 'vitest';
  }
  if (/\bpnpm\b/.test(cmd) && /\btest\b/.test(cmd)) {
    return 'vitest';
  }
  if (/\bnpm\b/.test(cmd) && /\btest\b/.test(cmd)) {
    return 'vitest';
  }
  // Add more runners later
  return 'unknown';
}

/**
 * Run tests tool
 */
export async function runTests(input: RunTestsInput): Promise<RunTestsOutput> {
  // Validate input
  if (!validateInput(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateInput.errors)}`);
  }

  const fallbackCwd = resolve(process.cwd(), 'services/task-mcp');
  const cwd =
    input.cwd ||
    (existsSync(fallbackCwd) ? fallbackCwd : process.cwd());
  const cmd = input.cmd || 'pnpm exec vitest run --reporter=json';
  const timeoutMs = input.timeoutMs || 600000;
  const envAllow = input.envAllow || [
    'NODE_ENV',
    'PATH',
    'Path',
    'PNPM_HOME',
    'PATHEXT',
    'ComSpec',
    'SystemRoot',
    'SYSTEMROOT'
  ];

  const { command, args } = parseCommand(cmd);
  const runner = detectRunner(cmd);

  if (runner !== 'vitest') {
    throw new Error('RUNNER_ERROR: Only Vitest runner is supported');
  }

  const spawnResult = await safeSpawn(command, args, { cwd, timeoutMs, envAllow });

  if (spawnResult.timedOut) {
    throw new Error('TIMEOUT: Test execution timed out');
  }

  let parsed: ReturnType<typeof parseVitestOutput>;
  try {
    parsed = parseVitestOutput(spawnResult.stdout);
  } catch (err) {
    throw new Error(`PARSE_ERROR: ${(err as Error).message}`);
  }

  const output: RunTestsOutput = {
    total: parsed.total,
    passed: parsed.passed,
    failed: parsed.failed,
    durationMs: parsed.durationMs,
    failedTests: parsed.failedTests,
    meta: {
      runner,
      cmd,
      cwd,
      exitCode: spawnResult.exitCode,
    },
  };

  // Validate output
  if (!validateOutput(output)) {
    throw new Error(`Invalid output: ${ajv.errorsText(validateOutput.errors)}`);
  }

  // Consumers are expected to inspect meta.exitCode and decide how to handle failures.
  return output;
}
