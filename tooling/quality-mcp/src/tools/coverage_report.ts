import Ajv from 'ajv/dist/2020.js';
import picomatch from 'picomatch';
import { resolve, relative } from 'node:path';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';
import {
  normalizeToRepo,
  parseCoverageSummary,
  parseLcovFile,
  parseCoverageFinal,
  type CoverageRatios,
  type SummaryFileRatios
} from '../parsers/istanbul.js';

export interface CoverageReportInput {
  summaryPath?: string;
  lcovPath?: string;
  repoRoot?: string;
  exclude?: string[];
}

export interface CoverageFileMetrics extends CoverageRatios {
  path: string;
}

export interface CoverageReportOutput {
  total: CoverageRatios;
  files: CoverageFileMetrics[];
  meta?: {
    source: 'istanbul';
    summaryPath: string;
    lcovPath: string;
    excluded: string[];
  };
}

const ajv = new Ajv({ allErrors: true });
const inputSchema = loadSchema('quality_coverage.input.schema.json');
const outputSchema = loadSchema('quality_coverage.output.schema.json');

const validateInput = ajv.compile(inputSchema);
const validateOutput = ajv.compile(outputSchema);

const DEFAULT_SUMMARY = 'services/task-mcp/coverage/coverage-summary.json';
const DEFAULT_LCOV = 'services/task-mcp/coverage/lcov.info';
const DEFAULT_EXCLUDE = ['**/*.test.*', '**/__tests__/**', '**/fixtures/**'];

const clampRatio = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

const mergeRatios = (summary: SummaryFileRatios, lcov?: Partial<CoverageRatios>): CoverageRatios => ({
  lines: clampRatio(lcov?.lines ?? summary.lines),
  statements: clampRatio(summary.statements),
  branches: clampRatio(lcov?.branches ?? summary.branches),
  functions: clampRatio(lcov?.functions ?? summary.functions)
});

const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

const normalizeMetaPath = (absolutePath: string): string => {
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath && !relativePath.startsWith('..')) {
    return toPosixPath(relativePath);
  }
  return toPosixPath(absolutePath);
};

export async function coverageReport(input: CoverageReportInput): Promise<CoverageReportOutput> {
  if (!validateInput(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateInput.errors)}`);
  }

  const summaryPath = input.summaryPath ?? DEFAULT_SUMMARY;
  const lcovPath = input.lcovPath ?? DEFAULT_LCOV;
  const repoRoot = resolve(process.cwd(), input.repoRoot ?? '.');
  const excludePatterns = input.exclude ?? DEFAULT_EXCLUDE;
  const excludeMatchers = excludePatterns.map((pattern) => picomatch(pattern));
  const excludedFiles: string[] = [];

  const summaryAbsolute = resolve(process.cwd(), summaryPath);
  let summaryResult: Awaited<ReturnType<typeof parseCoverageSummary>>;
  let summaryMetaPath = toPosixPath(summaryPath);

  try {
    summaryResult = await parseCoverageSummary(summaryAbsolute);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      const fallbackPath = summaryAbsolute.replace(/coverage-summary\.json$/i, 'coverage-final.json');
      summaryResult = await parseCoverageFinal(fallbackPath);
      summaryMetaPath = normalizeMetaPath(fallbackPath);
    } else {
      throw error;
    }
  }

  const lcovAbsolute = resolve(process.cwd(), lcovPath);
  let lcovRecords: Map<string, Partial<CoverageRatios>>;
  let lcovMetaPath = toPosixPath(lcovPath);
  try {
    lcovRecords = await parseLcovFile(lcovAbsolute);
    lcovMetaPath = normalizeMetaPath(lcovAbsolute);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NOT_FOUND')) {
      lcovRecords = new Map();
    } else {
      throw error;
    }
  }

  const lcovByPath = new Map<string, Partial<CoverageRatios>>();
  for (const record of lcovRecords.values()) {
    const normalized = normalizeToRepo(record.path, repoRoot);
    if (normalized.outsideRepo) {
      console.warn(`coverage_report: file outside repo root detected in lcov: ${record.path}`);
    }
    if (!normalized.normalized) {
      continue;
    }
    lcovByPath.set(normalized.normalized, {
      lines: record.lines,
      branches: record.branches,
      functions: record.functions
    });
  }

  const files: CoverageFileMetrics[] = [];

  for (const [rawPath, ratios] of summaryResult.files.entries()) {
    const normalized = normalizeToRepo(rawPath, repoRoot);
    if (normalized.outsideRepo) {
      console.warn(`coverage_report: file outside repo root detected in summary: ${rawPath}`);
    }
    const normalizedPath = normalized.normalized || rawPath;

    if (excludeMatchers.some((matcher) => matcher(normalizedPath))) {
      excludedFiles.push(normalizedPath);
      continue;
    }

    const lcovRatios = lcovByPath.get(normalizedPath);
    const merged = mergeRatios(ratios, lcovRatios);

    // Vitest's coverage-final does not include separate line metrics; we reuse statement ratios as an approximation.
    files.push({
      path: normalizedPath,
      lines: merged.lines,
      statements: merged.statements,
      branches: merged.branches,
      functions: merged.functions
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const excludedUnique = Array.from(new Set(excludedFiles)).sort();

  const output: CoverageReportOutput = {
    total: {
      lines: clampRatio(summaryResult.total.lines),
      statements: clampRatio(summaryResult.total.statements),
      branches: clampRatio(summaryResult.total.branches),
      functions: clampRatio(summaryResult.total.functions)
    },
    files,
    meta: {
      source: 'istanbul',
      summaryPath: summaryMetaPath,
      lcovPath: lcovMetaPath,
      excluded: excludedUnique
    }
  };

  if (!validateOutput(output)) {
    throw new Error(`Invalid output: ${ajv.errorsText(validateOutput.errors)}`);
  }

  return output;
}
