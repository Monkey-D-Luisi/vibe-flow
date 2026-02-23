/**
 * Tool: quality.run_tests
 *
 * Runs test suite and reports results.
 */

import { safeSpawn } from '../exec/spawn.js';
import { parseVitestOutput, type VitestSummary } from '../parsers/vitest.js';

const DEFAULT_COMMAND = 'pnpm vitest run --reporter=json';
const ENV_ALLOW = ['PATH', 'Path', 'NODE_ENV', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI'];

export interface RunTestsInput {
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  reporter?: 'vitest' | 'raw';
}

export interface RunTestsOutput {
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  summary?: VitestSummary;
  stdout?: string;
  stderr?: string;
}

/**
 * Parse command string into cmd and args.
 */
function parseCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  return { cmd, args };
}

/**
 * Execute test runner tool.
 */
export async function runTestsTool(input: RunTestsInput): Promise<RunTestsOutput> {
  const command = input.command || DEFAULT_COMMAND;
  const cwd = input.cwd || process.cwd();
  const timeoutMs = input.timeoutMs || 300000;
  const reporter = input.reporter || 'vitest';

  const { cmd, args } = parseCommand(command);

  const result = await safeSpawn(cmd, args, {
    cwd,
    timeoutMs,
    envAllow: ENV_ALLOW,
  });

  if (result.timedOut) {
    return {
      command,
      success: false,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: true,
      stderr: 'Test execution timed out',
    };
  }

  // Try to parse Vitest JSON output
  let summary: VitestSummary | undefined;
  if (reporter === 'vitest') {
    const stdout = result.stdout.trim();
    // Find JSON in output (vitest may include non-JSON text before/after)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart >= 0) {
      const jsonContent = stdout.slice(jsonStart);
      try {
        summary = parseVitestOutput(jsonContent);
      } catch {
        // Fall through to raw output
      }
    }
  }

  const success = result.exitCode === 0 && (summary ? summary.success : true);

  return {
    command,
    success,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: false,
    summary,
    stdout: summary ? undefined : result.stdout,
    stderr: result.stderr || undefined,
  };
}

/**
 * Tool definition for registration.
 */
export const runTestsToolDef = {
  name: 'quality.run_tests',
  description: 'Run test suite and report results in structured format',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Test command to run',
        default: DEFAULT_COMMAND,
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 300000,
      },
      reporter: {
        type: 'string',
        enum: ['vitest', 'raw'],
        description: 'Test reporter format to parse',
        default: 'vitest',
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    return runTestsTool(params as unknown as RunTestsInput);
  },
};
