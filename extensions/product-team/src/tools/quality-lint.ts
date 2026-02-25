import type { ToolDef, ToolDeps } from './index.js';
import {
  QualityLintParams,
  type QualityLintParams as QualityLintParamsType,
} from '../schemas/quality-lint.schema.js';
import { assertSafeCommand, parseCommand, safeSpawn } from '../exec/spawn.js';
import { parseEslintOutput, summarizeEslint } from '../quality/parsers/eslint.js';
import { parseRuffOutput, summarizeRuff } from '../quality/parsers/ruff.js';
import type { NormalizedLintFileReport } from '../quality/parsers/types.js';
import {
  beginQualityExecution,
  getTaskOrThrow,
  resolveWorkingDir,
  updateTaskMetadata,
} from './quality-tool-common.js';
import { mergeLintMetrics } from './quality-metadata.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_COMMANDS = {
  eslint: 'pnpm --filter @openclaw/plugin-product-team exec eslint src/**/*.ts -f json --no-cache',
  ruff: 'ruff check --output-format json .',
} as const;
const ENV_ALLOW = ['NODE_ENV', 'PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CI'];

interface LintSummaryByRule {
  ruleId: string | null;
  errors: number;
  warnings: number;
}

interface QualityLintOutput {
  errors: number;
  warnings: number;
  byFile: NormalizedLintFileReport[];
  summaryByRule: LintSummaryByRule[];
  meta: {
    tool: 'eslint' | 'ruff';
    cmd: string;
    cwd: string;
    exitCode: number;
  };
}

function extractJsonArray(output: string): string {
  const trimmed = output.trim();
  const start = trimmed.indexOf('[');
  if (start >= 0) {
    return trimmed.slice(start);
  }
  return trimmed;
}

function summarizeByRule(byFile: NormalizedLintFileReport[]): LintSummaryByRule[] {
  const counts = new Map<string | null, LintSummaryByRule>();
  for (const file of byFile) {
    for (const message of file.messages) {
      const key = message.ruleId ?? null;
      const existing = counts.get(key) ?? { ruleId: key, errors: 0, warnings: 0 };
      if (message.severity === 'error') {
        existing.errors += 1;
      }
      if (message.severity === 'warning') {
        existing.warnings += 1;
      }
      counts.set(key, existing);
    }
  }
  return Array.from(counts.values()).sort((a, b) => {
    const left = a.ruleId ?? '';
    const right = b.ruleId ?? '';
    return left.localeCompare(right);
  });
}

export function qualityLintToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.lint',
    label: 'Run Lint',
    description: 'Run lint checks and persist lint_clean evidence in task metadata',
    parameters: QualityLintParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<QualityLintParamsType>(QualityLintParams, params);
      const task = getTaskOrThrow(deps, input.taskId);
      const execCtx = beginQualityExecution(deps, input.taskId, input.agentId);
      const engine = input.engine ?? 'eslint';
      const command = input.command ?? DEFAULT_COMMANDS[engine];
      const workingDir = resolveWorkingDir(deps, input.workingDir);
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const { cmd, args } = parseCommand(command);
      assertSafeCommand(cmd, args);

      const spawnResult = await safeSpawn(cmd, args, {
        cwd: workingDir,
        timeoutMs,
        envAllow: ENV_ALLOW,
      });

      const rawOutput = spawnResult.stdout.trim().length > 0
        ? spawnResult.stdout
        : spawnResult.stderr;
      const jsonOutput = extractJsonArray(rawOutput);
      const byFile = engine === 'ruff'
        ? parseRuffOutput(jsonOutput)
        : parseEslintOutput(jsonOutput);
      const summary = engine === 'ruff'
        ? summarizeRuff(byFile)
        : summarizeEslint(byFile);

      const output: QualityLintOutput = {
        errors: summary.totalErrors,
        warnings: summary.totalWarnings,
        byFile,
        summaryByRule: summarizeByRule(byFile),
        meta: {
          tool: engine,
          cmd: command,
          cwd: workingDir,
          exitCode: spawnResult.exitCode,
        },
      };

      const lintClean = output.errors === 0;
      const metadata = mergeLintMetrics(task.metadata, lintClean, output as unknown as Record<string, unknown>);
      const updatedTask = updateTaskMetadata(deps, task.id, input.rev, metadata);
      deps.eventLog.logQualityEvent(
        task.id,
        'quality.lint',
        input.agentId,
        execCtx.correlationId,
        {
          errors: output.errors,
          warnings: output.warnings,
          lintClean,
          exitCode: output.meta.exitCode,
        },
      );
      execCtx.logger.info('quality.lint.complete', {
        durationMs: Date.now() - execCtx.startedAt,
        errors: output.errors,
        warnings: output.warnings,
      });

      const result = { task: updatedTask, output };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
