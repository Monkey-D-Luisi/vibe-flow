/**
 * Tool: qgate.lint
 *
 * Runs linters and reports violations.
 */

import { safeSpawn, assertSafeCommand, parseCommand } from '@openclaw/quality-contracts/exec/spawn';
import { assertOptionalString, assertOptionalStringEnum, assertOptionalNumber } from '@openclaw/quality-contracts/validate/tools';
import { parseEslintOutput, summarizeEslint } from '../parsers/eslint.js';
import { parseRuffOutput, summarizeRuff } from '../parsers/ruff.js';
import type { NormalizedLintFileReport } from '../parsers/types.js';

const DEFAULT_COMMAND: Record<string, string> = {
  eslint: 'pnpm lint -f json',
  ruff: 'ruff check --output-format json .',
};

const ENV_ALLOW = ['PATH', 'Path', 'NODE_ENV', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];

export type LintEngine = 'eslint' | 'ruff';

export interface LintInput {
  engine?: LintEngine;
  command?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface LintOutput {
  engine: string;
  command: string;
  totalErrors: number;
  totalWarnings: number;
  filesWithIssues: number;
  totalFiles: number;
  reports: NormalizedLintFileReport[];
  exitCode: number;
  durationMs: number;
  raw?: string;
}

/**
 * Execute lint tool.
 */
interface ParsedLintResult {
  reports: NormalizedLintFileReport[];
  totalErrors: number;
  totalWarnings: number;
  filesWithIssues: number;
  totalFiles: number;
}

function extractJsonContent(stdout: string): string {
  const jsonStart = stdout.indexOf('[');
  return jsonStart > 0 ? stdout.slice(jsonStart) : stdout;
}

function parseLintOutput(engine: string, jsonContent: string): ParsedLintResult {
  if (engine === 'ruff') {
    const reports = parseRuffOutput(jsonContent);
    const summary = summarizeRuff(reports);
    return { reports, ...summary };
  }
  const reports = parseEslintOutput(jsonContent);
  const summary = summarizeEslint(reports);
  return { reports, ...summary };
}

function buildRawOutput(stdout: string, stderr: string): string | undefined {
  const rawParts: string[] = [];
  if (stdout) rawParts.push(stdout);
  if (stderr) rawParts.push(`stderr: ${stderr}`);
  return rawParts.length > 0 ? rawParts.join('\n') : undefined;
}

export async function lintTool(input: LintInput): Promise<LintOutput> {
  const engine = input.engine || 'eslint';
  const command = input.command || DEFAULT_COMMAND[engine] || DEFAULT_COMMAND.eslint;
  const cwd = input.cwd || process.cwd();
  const timeoutMs = input.timeoutMs || 120000;

  const { cmd, args } = parseCommand(command);
  assertSafeCommand(cmd, args);

  const result = await safeSpawn(cmd, args, {
    cwd,
    timeoutMs,
    envAllow: ENV_ALLOW,
  });

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const jsonContent = extractJsonContent(stdout);

  let parsed: ParsedLintResult = { reports: [], totalErrors: 0, totalWarnings: 0, filesWithIssues: 0, totalFiles: 0 };

  if (jsonContent) {
    try {
      parsed = parseLintOutput(engine, jsonContent);
    } catch {
      // If parsing fails, return raw output
    }
  }

  const raw = parsed.reports.length === 0 ? buildRawOutput(stdout, stderr) : undefined;

  return {
    engine,
    command,
    ...parsed,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    raw,
  };
}

/**
 * Tool definition for registration.
 */
export const lintToolDef = {
  name: 'qgate.lint',
  description: 'Run linter (ESLint or Ruff) and report violations in normalized format',
  parameters: {
    type: 'object',
    properties: {
      engine: {
        type: 'string',
        enum: ['eslint', 'ruff'],
        description: 'Linting engine to use',
        default: 'eslint',
      },
      command: {
        type: 'string',
        description: 'Custom lint command (overrides engine default)',
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 120000,
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    assertOptionalStringEnum(params['engine'], 'engine', ['eslint', 'ruff'] as const);
    assertOptionalString(params['command'], 'command');
    assertOptionalString(params['cwd'], 'cwd');
    assertOptionalNumber(params['timeoutMs'], 'timeoutMs');
    return lintTool(params as unknown as LintInput);
  },
};
