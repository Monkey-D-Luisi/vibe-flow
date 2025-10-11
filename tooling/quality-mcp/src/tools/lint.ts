import Ajv from 'ajv/dist/2020.js';
import { resolve } from 'node:path';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';
import { safeSpawn } from '../exec/spawn.js';
import { parseEslintJson } from '../parsers/eslint.js';
import { parseRuffJson } from '../parsers/ruff.js';
import type { NormalizedLintFileReport, NormalizedLintMessage } from '../parsers/types.js';

export type LintTool = 'eslint' | 'ruff';

export interface LintInput {
  cwd?: string;
  tool?: LintTool;
  cmd?: string;
  paths?: string[];
  timeoutMs?: number;
  envAllow?: string[];
}

export interface LintSummaryByRule {
  ruleId: string | null;
  errors: number;
  warnings: number;
}

export interface LintOutput {
  errors: number;
  warnings: number;
  byFile: NormalizedLintFileReport[];
  summaryByRule: LintSummaryByRule[];
  meta: {
    tool: LintTool;
    cmd: string;
    cwd: string;
    exitCode: number;
  };
}

interface SpawnLikeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const ajv = new Ajv({ allErrors: true });

const inputSchema = loadSchema('quality_lint.input.schema.json');
const outputSchema = loadSchema('quality_lint.output.schema.json');

const validateInput = ajv.compile<LintInput>(inputSchema);
const validateOutput = ajv.compile<LintOutput>(outputSchema);

const DEFAULT_COMMAND: Record<LintTool, string> = {
  eslint: 'pnpm -C services/task-mcp lint -f json',
  ruff: 'ruff check --format json'
};

const DEFAULT_ENV_ALLOW = [
  'NODE_ENV',
  'PATH',
  'Path',
  'PNPM_HOME',
  'PATHEXT',
  'ComSpec',
  'SystemRoot',
  'SYSTEMROOT'
];

const PACKAGE_MANAGER_NAMES = ['pnpm', 'npm', 'yarn', 'bun'];

function parseCommand(cmd: string): { command: string; args: string[] } {
  const tokens = cmd.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error('RUNNER_ERROR: Command is empty');
  }
  return {
    command: tokens[0]!,
    args: tokens.slice(1)
  };
}

function looksLikePackageManager(command: string): boolean {
  const lower = command.toLowerCase();
  return PACKAGE_MANAGER_NAMES.some((name) => lower === name || lower.endsWith(`/${name}`) || lower.endsWith(`\\${name}`) || lower.endsWith(`${name}.cmd`) || lower.endsWith(`${name}.ps1`));
}

function appendPaths(command: string, args: string[], paths?: string[]): string[] {
  if (!paths || paths.length === 0) {
    return args;
  }
  const filtered = paths.filter((item) => typeof item === 'string' && item.length > 0);
  if (filtered.length === 0) {
    return args;
  }
  if (looksLikePackageManager(command)) {
    if (args.includes('--')) {
      return [...args, ...filtered];
    }
    return [...args, '--', ...filtered];
  }
  return [...args, ...filtered];
}

function sortFiles(files: NormalizedLintFileReport[]): NormalizedLintFileReport[] {
  return [...files].sort((a, b) => {
    if (b.errors !== a.errors) {
      return b.errors - a.errors;
    }
    if (b.warnings !== a.warnings) {
      return b.warnings - a.warnings;
    }
    return a.file.localeCompare(b.file);
  });
}

function computeTotals(files: NormalizedLintFileReport[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const file of files) {
    errors += file.errors;
    warnings += file.warnings;
  }
  return { errors, warnings };
}

function buildSummaryByRule(files: NormalizedLintFileReport[]): LintSummaryByRule[] {
  const map = new Map<string, LintSummaryByRule>();

  const keyForRule = (ruleId: string | null): string => (ruleId === null ? '__null__' : ruleId);

  for (const file of files) {
    for (const message of file.messages) {
      if (message.severity !== 'error' && message.severity !== 'warning') {
        continue;
      }
      const storageKey = keyForRule(message.ruleId ?? null);
      let entry = map.get(storageKey);
      if (!entry) {
        entry = {
          ruleId: message.ruleId ?? null,
          errors: 0,
          warnings: 0
        };
        map.set(storageKey, entry);
      }
      if (message.severity === 'error') {
        entry.errors += 1;
      } else {
        entry.warnings += 1;
      }
    }
  }

  const summaries = Array.from(map.values());
  summaries.sort((a, b) => {
    if (b.errors !== a.errors) {
      return b.errors - a.errors;
    }
    if (b.warnings !== a.warnings) {
      return b.warnings - a.warnings;
    }
    const aId = a.ruleId ?? '';
    const bId = b.ruleId ?? '';
    if (aId === bId) {
      return 0;
    }
    if (a.ruleId === null) {
      return 1;
    }
    if (b.ruleId === null) {
      return -1;
    }
    return aId.localeCompare(bId);
  });
  return summaries;
}

function pickParser(tool: LintTool): (stdout: string) => NormalizedLintFileReport[] {
  if (tool === 'ruff') {
    return parseRuffJson;
  }
  return parseEslintJson;
}

function sanitizeEnvAllow(envAllow?: string[]): string[] {
  if (!envAllow) {
    return DEFAULT_ENV_ALLOW;
  }
  const merged = new Set<string>([...DEFAULT_ENV_ALLOW, ...envAllow]);
  return Array.from(merged);
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function coerceJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (isValidJson(trimmed)) {
    return trimmed;
  }

  const extractSegment = (open: '[' | '{', close: ']' | '}') => {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      if (isValidJson(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const arrayCandidate = extractSegment('[', ']');
  if (arrayCandidate) {
    return arrayCandidate;
  }
  const objectCandidate = extractSegment('{', '}');
  if (objectCandidate) {
    return objectCandidate;
  }

  return trimmed;
}

/**
 * Execute configured linter and return normalized lint report.
 */
export async function lint(input: LintInput): Promise<LintOutput> {
  if (!validateInput(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateInput.errors)}`);
  }

  const tool: LintTool = input.tool ?? 'eslint';
  const cmd = input.cmd ?? DEFAULT_COMMAND[tool];
  if (!cmd) {
    throw new Error(`RUNNER_ERROR: Missing command for tool ${tool}`);
  }

  const parsedCommand = parseCommand(cmd);
  const argsWithPaths = appendPaths(parsedCommand.command, parsedCommand.args, input.paths);

  const cwd = input.cwd ? resolve(process.cwd(), input.cwd) : process.cwd();
  const timeoutMs = input.timeoutMs ?? 600000;
  const envAllow = sanitizeEnvAllow(input.envAllow);

  const spawnResult = (await safeSpawn(parsedCommand.command, argsWithPaths, {
    cwd,
    timeoutMs,
    envAllow
  })) as SpawnLikeResult;

  if (spawnResult.timedOut) {
    throw new Error('TIMEOUT: Lint execution timed out');
  }

  const parser = pickParser(tool);
  const payload = coerceJsonPayload(spawnResult.stdout);
  let files: NormalizedLintFileReport[];
  try {
    files = parser(payload);
  } catch (error) {
    throw new Error((error as Error).message || 'PARSE_ERROR: Unable to parse linter output');
  }

  const sortedFiles = sortFiles(files);
  const totals = computeTotals(sortedFiles);
  const summaryByRule = buildSummaryByRule(sortedFiles);

  if (spawnResult.exitCode !== 0 && totals.errors === 0 && totals.warnings === 0) {
    const detail = spawnResult.stderr?.trim() || 'Lint process failed without diagnostics';
    throw new Error(`RUNNER_ERROR: ${detail}`);
  }

  const output: LintOutput = {
    errors: totals.errors,
    warnings: totals.warnings,
    byFile: sortedFiles,
    summaryByRule,
    meta: {
      tool,
      cmd,
      cwd,
      exitCode: spawnResult.exitCode
    }
  };

  if (!validateOutput(output)) {
    throw new Error(`Invalid output: ${ajv.errorsText(validateOutput.errors)}`);
  }

  return output;
}

export type { NormalizedLintFileReport, NormalizedLintMessage };
