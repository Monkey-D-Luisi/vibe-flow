/**
 * Tool: quality.coverage
 *
 * Parses and reports test coverage from Istanbul/nyc output.
 */

import { readFileSafe } from '../fs/read.js';
import { resolve } from 'node:path';
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
 */
async function loadSummary(path: string): Promise<CoverageSummaryReport | null> {
  try {
    const raw = await readFileSafe(path);
    return parseCoverageSummary(raw);
  } catch {
    return null;
  }
}

/**
 * Try to load lcov.info.
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
  } catch {
    return null;
  }
}

/**
 * Execute coverage report tool.
 */
export async function coverageReportTool(input: CoverageInput): Promise<CoverageOutput> {
  const cwd = input.cwd || process.cwd();
  const format = input.format || 'auto';
  const summaryPath = resolve(cwd, input.summaryPath || DEFAULT_SUMMARY);
  const lcovPath = resolve(cwd, input.lcovPath || DEFAULT_LCOV);

  // Try summary format first (or if explicitly requested)
  if (format === 'summary' || format === 'auto') {
    const summary = await loadSummary(summaryPath);
    if (summary) {
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
  }

  // Try lcov format (or if explicitly requested)
  if (format === 'lcov' || format === 'auto') {
    const lcov = await loadLcov(lcovPath);
    if (lcov) {
      return lcov;
    }
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
  name: 'quality.coverage',
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
    return coverageReportTool(params as unknown as CoverageInput);
  },
};
