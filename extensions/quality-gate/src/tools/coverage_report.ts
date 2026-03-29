/**
 * Tool: qgate.coverage
 *
 * Parses and reports test coverage from Istanbul/nyc output.
 */

import { readFileSafe } from '@openclaw/quality-contracts/fs/read';
import {
  assertOptionalString,
  assertOptionalStringEnum,
} from '@openclaw/quality-contracts/validate/tools';
import { resolve } from 'node:path';
import { assertPathContained } from '@openclaw/quality-contracts/exec/spawn';
import {
  parseCoverageSummary,
  parseLcov,
  computeLcovSummary,
  type CoverageSummaryReport,
} from '../parsers/istanbul.js';

const DEFAULT_SUMMARY = 'coverage/coverage-summary.json';
const DEFAULT_LCOV = 'coverage/lcov.info';

export interface CoverageInput {
  summaryPath?: string;
  lcovPath?: string;
  cwd?: string;
  format?: 'summary' | 'lcov' | 'auto';
}

export interface CoverageOutput {
  format: string;
  linePct: number;
  branchPct: number;
  functionPct: number;
  statementPct?: number;
  fileCount: number;
  details?: Record<string, { linePct: number; branchPct: number; functionPct: number }>;
}

/**
 * Try to load coverage-summary.json.
 * Returns null only if the file is missing; re-throws parse errors.
 */
async function loadSummary(path: string): Promise<CoverageSummaryReport | null> {
  try {
    const raw = await readFileSafe(path);
    return parseCoverageSummary(raw);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

/**
 * Try to load lcov.info.
 * Returns null only if the file is missing; re-throws parse errors.
 */
async function loadLcov(path: string): Promise<CoverageOutput | null> {
  try {
    const raw = await readFileSafe(path);
    const records = parseLcov(raw);
    if (records.length === 0) return null;

    const summary = computeLcovSummary(records);
    return {
      format: 'lcov',
      linePct: summary.linesPct,
      branchPct: summary.branchesPct,
      functionPct: summary.functionsPct,
      fileCount: records.length,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

function buildSummaryOutput(summary: CoverageSummaryReport): CoverageOutput {
  const total = summary.total;
  const details: Record<string, { linePct: number; branchPct: number; functionPct: number }> = {};

  for (const [file, data] of Object.entries(summary.files)) {
    details[file] = {
      linePct: data.lines.pct,
      branchPct: data.branches.pct,
      functionPct: data.functions.pct,
    };
  }

  return {
    format: 'istanbul-summary',
    linePct: total.lines.pct,
    branchPct: total.branches.pct,
    functionPct: total.functions.pct,
    statementPct: total.statements.pct,
    fileCount: Object.keys(summary.files).length,
    details,
  };
}

interface ResolvedCoverageInput {
  cwd: string;
  format: string;
  summaryPath: string;
  lcovPath: string;
}

function resolveInput(input: CoverageInput): ResolvedCoverageInput {
  const cwd = resolve(input.cwd || process.cwd());
  const format = input.format || 'auto';
  const summaryPath = resolve(cwd, input.summaryPath || DEFAULT_SUMMARY);
  const lcovPath = resolve(cwd, input.lcovPath || DEFAULT_LCOV);
  assertPathContained(summaryPath, cwd);
  assertPathContained(lcovPath, cwd);
  return { cwd, format, summaryPath, lcovPath };
}

function shouldTrySummary(format: string): boolean {
  return format === 'summary' || format === 'auto';
}

function shouldTryLcov(format: string): boolean {
  return format === 'lcov' || format === 'auto';
}

/**
 * Execute coverage report tool.
 */
export async function coverageReportTool(input: CoverageInput): Promise<CoverageOutput> {
  const { format, summaryPath, lcovPath } = resolveInput(input);

  if (shouldTrySummary(format)) {
    const summary = await loadSummary(summaryPath);
    if (summary) return buildSummaryOutput(summary);
  }

  if (shouldTryLcov(format)) {
    const lcov = await loadLcov(lcovPath);
    if (lcov) return lcov;
  }

  throw new Error(
    `NOT_FOUND: No coverage data found. Looked for:\n` +
    `  - ${summaryPath}\n` +
    `  - ${lcovPath}\n` +
    `Run tests with coverage enabled first.`
  );
}

/**
 * Tool definition for registration.
 */
export const coverageReportToolDef = {
  name: 'qgate.coverage',
  description: 'Parse and report test coverage from Istanbul/nyc coverage output',
  parameters: {
    type: 'object',
    properties: {
      summaryPath: {
        type: 'string',
        description: 'Path to coverage-summary.json (relative to cwd)',
        default: DEFAULT_SUMMARY,
      },
      lcovPath: {
        type: 'string',
        description: 'Path to lcov.info (relative to cwd)',
        default: DEFAULT_LCOV,
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
      format: {
        type: 'string',
        enum: ['summary', 'lcov', 'auto'],
        description: 'Coverage format to parse',
        default: 'auto',
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    assertOptionalString(params['summaryPath'], 'summaryPath');
    assertOptionalString(params['lcovPath'], 'lcovPath');
    assertOptionalString(params['cwd'], 'cwd');
    assertOptionalStringEnum(params['format'], 'format', ['summary', 'lcov', 'auto'] as const);
    return coverageReportTool(params as unknown as CoverageInput);
  },
};
