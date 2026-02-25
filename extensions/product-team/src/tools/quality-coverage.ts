import type { ToolDef, ToolDeps } from './index.js';
import {
  QualityCoverageParams,
  type QualityCoverageParams as QualityCoverageParamsType,
} from '../schemas/quality-coverage.schema.js';
import { parseCoverageSummary, parseLcov, computeLcovSummary } from '../quality/parsers/istanbul.js';
import { assertPathContained } from '../exec/spawn.js';
import { filterByExclude, readFileSafe } from '../quality/fs.js';
import {
  beginQualityExecution,
  getTaskOrThrow,
  resolveWorkingDir,
  updateTaskMetadata,
} from './quality-tool-common.js';
import { mergeCoverageMetrics } from './quality-metadata.js';
import { resolve } from 'node:path';

const DEFAULT_SUMMARY_PATH = 'coverage/coverage-summary.json';
const DEFAULT_LCOV_PATH = 'coverage/lcov.info';
const DEFAULT_EXCLUDE = ['**/*.test.*', '**/__tests__/**', '**/fixtures/**'];

interface CoverageTotals {
  lines: number;
  statements: number;
  branches: number;
  functions: number;
}

interface CoverageFile {
  path: string;
  lines: number;
  statements?: number;
  branches?: number;
  functions?: number;
}

interface QualityCoverageOutput {
  total: CoverageTotals;
  files: CoverageFile[];
  meta: {
    source: 'istanbul';
    summaryPath: string;
    lcovPath: string;
    excluded: string[];
  };
}

function toRatio(percent: number): number {
  return Math.max(0, Math.min(1, Math.round((percent / 100) * 10000) / 10000));
}

function buildFromSummary(
  raw: string,
  exclude: string[],
): QualityCoverageOutput {
  const parsed = parseCoverageSummary(raw);
  const files = Object.entries(parsed.files)
    .filter(([path]) => filterByExclude(path, exclude))
    .map(([path, metrics]) => ({
      path,
      lines: toRatio(metrics.lines.pct),
      statements: toRatio(metrics.statements.pct),
      branches: toRatio(metrics.branches.pct),
      functions: toRatio(metrics.functions.pct),
    }));

  return {
    total: {
      lines: toRatio(parsed.total.lines.pct),
      statements: toRatio(parsed.total.statements.pct),
      branches: toRatio(parsed.total.branches.pct),
      functions: toRatio(parsed.total.functions.pct),
    },
    files,
    meta: {
      source: 'istanbul',
      summaryPath: DEFAULT_SUMMARY_PATH,
      lcovPath: DEFAULT_LCOV_PATH,
      excluded: exclude,
    },
  };
}

function buildFromLcov(raw: string, exclude: string[]): QualityCoverageOutput {
  const records = parseLcov(raw).filter((record) => filterByExclude(record.file, exclude));
  const summary = computeLcovSummary(records);
  const files = records.map((record) => ({
    path: record.file,
    lines: record.linesFound === 0 ? 1 : record.linesHit / record.linesFound,
    statements: record.linesFound === 0 ? 1 : record.linesHit / record.linesFound,
    branches: record.branchesFound === 0 ? 1 : record.branchesHit / record.branchesFound,
    functions: record.functionsFound === 0 ? 1 : record.functionsHit / record.functionsFound,
  }));

  return {
    total: {
      lines: toRatio(summary.linesPct),
      statements: toRatio(summary.linesPct),
      branches: toRatio(summary.branchesPct),
      functions: toRatio(summary.functionsPct),
    },
    files,
    meta: {
      source: 'istanbul',
      summaryPath: DEFAULT_SUMMARY_PATH,
      lcovPath: DEFAULT_LCOV_PATH,
      excluded: exclude,
    },
  };
}

export function qualityCoverageToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.coverage',
    label: 'Collect Coverage',
    description: 'Parse coverage report and persist coverage metrics in task metadata',
    parameters: QualityCoverageParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<QualityCoverageParamsType>(QualityCoverageParams, params);
      const task = getTaskOrThrow(deps, input.taskId);
      const execCtx = beginQualityExecution(deps, input.taskId, input.agentId);
      const workingDir = resolveWorkingDir(deps, input.workingDir);
      const summaryPath = resolve(workingDir, input.summaryPath ?? DEFAULT_SUMMARY_PATH);
      const lcovPath = resolve(workingDir, input.lcovPath ?? DEFAULT_LCOV_PATH);
      const exclude = input.exclude ?? DEFAULT_EXCLUDE;
      assertPathContained(summaryPath, workingDir);
      assertPathContained(lcovPath, workingDir);

      let output: QualityCoverageOutput | null = null;
      const format = input.format ?? 'auto';
      if (format === 'summary' || format === 'auto') {
        try {
          const rawSummary = await readFileSafe(summaryPath);
          output = buildFromSummary(rawSummary, exclude);
        } catch (error) {
          if (format === 'summary') {
            throw error;
          }
        }
      }

      if (!output && (format === 'lcov' || format === 'auto')) {
        const rawLcov = await readFileSafe(lcovPath);
        output = buildFromLcov(rawLcov, exclude);
      }

      if (!output) {
        throw new Error('NOT_FOUND: no coverage report found');
      }

      output.meta.summaryPath = input.summaryPath ?? DEFAULT_SUMMARY_PATH;
      output.meta.lcovPath = input.lcovPath ?? DEFAULT_LCOV_PATH;
      const coveragePct = Math.round(output.total.lines * 10000) / 100;
      const metadata = mergeCoverageMetrics(task.metadata, coveragePct, output as unknown as Record<string, unknown>);
      const updatedTask = updateTaskMetadata(deps, task.id, input.rev, metadata);
      deps.eventLog.logQualityEvent(
        task.id,
        'quality.coverage',
        input.agentId,
        execCtx.correlationId,
        { coveragePct },
      );
      execCtx.logger.info('quality.coverage.complete', {
        coveragePct,
        durationMs: Date.now() - execCtx.startedAt,
      });

      const result = { task: updatedTask, output };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
