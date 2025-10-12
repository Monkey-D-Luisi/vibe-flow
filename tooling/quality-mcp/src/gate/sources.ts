import { readJsonFile } from '../fs/read.js';
import { runTests } from '../tools/run_tests.js';
import { coverageReport } from '../tools/coverage_report.js';
import { lint } from '../tools/lint.js';
import { complexity } from '../tools/complexity.js';
import type { GateMetrics, GatePaths } from './types.js';

const DEFAULT_PATHS: GatePaths = {
  tests: '.qreport/tests.json',
  coverage: '.qreport/coverage.json',
  lint: '.qreport/lint.json',
  complexity: '.qreport/complexity.json'
};

interface TestsArtifact {
  total: number;
  failed: number;
}

interface CoverageArtifact {
  total?: {
    lines?: number;
  };
  coverage?: {
    lines?: number;
  };
  lines?: number;
}

interface LintArtifact {
  errors?: number;
  warnings?: number;
}

interface ComplexityArtifact {
  avgCyclomatic?: number;
  maxCyclomatic?: number;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function mergePaths(paths?: Partial<GatePaths>): GatePaths {
  return {
    ...DEFAULT_PATHS,
    ...(paths ?? {})
  };
}

export async function loadMetricsFromArtifacts(paths?: Partial<GatePaths>): Promise<GateMetrics> {
  const merged = mergePaths(paths);

  const tests = await readJsonFile<TestsArtifact>(merged.tests);
  const coverage = await readJsonFile<CoverageArtifact>(merged.coverage);
  const lintResult = await readJsonFile<LintArtifact>(merged.lint);
  const complexityResult = await readJsonFile<ComplexityArtifact>(merged.complexity);

  const metrics: GateMetrics = {
    tests: {
      total: Math.max(0, Math.trunc(normalizeNumber(tests.total))),
      failed: Math.max(0, Math.trunc(normalizeNumber(tests.failed)))
    },
    coverage: {
      lines: normalizeNumber(
        coverage.total?.lines ?? coverage.coverage?.lines ?? coverage.lines,
        0
      )
    },
    lint: {
      errors: Math.max(0, Math.trunc(normalizeNumber(lintResult.errors))),
      warnings: Math.max(0, Math.trunc(normalizeNumber(lintResult.warnings)))
    },
    complexity: {
      avgCyclomatic: normalizeNumber(complexityResult.avgCyclomatic, 0),
      maxCyclomatic: normalizeNumber(complexityResult.maxCyclomatic, 0)
    }
  };

  return metrics;
}

export async function loadMetricsFromTools(): Promise<GateMetrics> {
  const tests = await runTests({});
  const coverage = await coverageReport({});
  const lintResult = await lint({});
  const complexityResult = await complexity({});

  const metrics: GateMetrics = {
    tests: {
      total: Math.max(0, Math.trunc(normalizeNumber(tests.total))),
      failed: Math.max(0, Math.trunc(normalizeNumber(tests.failed)))
    },
    coverage: {
      lines: normalizeNumber(coverage.total?.lines, 0)
    },
    lint: {
      errors: Math.max(0, Math.trunc(normalizeNumber(lintResult.errors))),
      warnings: Math.max(0, Math.trunc(normalizeNumber(lintResult.warnings)))
    },
    complexity: {
      avgCyclomatic: normalizeNumber(complexityResult.avgCyclomatic, 0),
      maxCyclomatic: normalizeNumber(complexityResult.maxCyclomatic, 0)
    }
  };

  return metrics;
}

export function defaultPaths(): GatePaths {
  return { ...DEFAULT_PATHS };
}
