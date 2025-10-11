import { normalize as normalizePath, relative, resolve, isAbsolute } from 'node:path';
import { readFileSafe, readJsonFile } from '../fs/read.js';

export interface CoverageRatios {
  lines: number;
  statements: number;
  branches: number;
  functions: number;
}

export type SummaryFileRatios = CoverageRatios;

export interface SummaryParseResult {
  total: CoverageRatios;
  files: Map<string, SummaryFileRatios>;
}

export interface LcovFileRatios {
  path: string;
  lines?: number;
  branches?: number;
  functions?: number;
}

const clampRatio = (value: number): number => {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
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

const ratioFromMetric = (metric: any): number => {
  if (!metric || typeof metric !== 'object') {
    return 0;
  }
  if (typeof metric.total === 'number' && metric.total > 0 && typeof metric.covered === 'number') {
    return clampRatio(metric.covered / metric.total);
  }
  if (typeof metric.pct === 'number') {
    return clampRatio(metric.pct / 100);
  }
  return 0;
};

const toPosix = (value: string): string => value.replace(/\\/g, '/');

const ratio = (hit?: number, found?: number): number => {
  if (typeof found === 'number' && found > 0 && typeof hit === 'number') {
    return clampRatio(hit / found);
  }
  if (typeof found === 'number' && found === 0) {
    return 1;
  }
  return 0;
};

export async function parseCoverageSummary(summaryPath: string): Promise<SummaryParseResult> {
  const summary = await readJsonFile<Record<string, any>>(summaryPath);
  if (!summary || typeof summary !== 'object') {
    throw new Error(`PARSE_ERROR: Unexpected summary format at ${summaryPath}`);
  }

  const totalMetrics = summary.total;
  if (!totalMetrics) {
    throw new Error(`PARSE_ERROR: Missing total section in summary at ${summaryPath}`);
  }

  const total: CoverageRatios = {
    lines: ratioFromMetric(totalMetrics.lines),
    statements: ratioFromMetric(totalMetrics.statements),
    branches: ratioFromMetric(totalMetrics.branches),
    functions: ratioFromMetric(totalMetrics.functions)
  };

  const files = new Map<string, SummaryFileRatios>();
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total') {
      continue;
    }
    if (!value || typeof value !== 'object') {
      continue;
    }
    files.set(toPosix(key), {
      lines: ratioFromMetric(value.lines),
      statements: ratioFromMetric(value.statements),
      branches: ratioFromMetric(value.branches),
      functions: ratioFromMetric(value.functions)
    });
  }

  return { total, files };
}

interface CoverageFinalEntry {
  path: string;
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
}

const computeRatio = (covered: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  return clampRatio(covered / total);
};

const aggregateStatementRatio = (entry: CoverageFinalEntry) => {
  const statements = entry.s ?? {};
  const totals = Object.values(statements);
  const total = totals.length;
  const covered = totals.filter((value) => value > 0).length;
  return { covered, total };
};

const aggregateFunctionRatio = (entry: CoverageFinalEntry) => {
  const functions = entry.f ?? {};
  const totals = Object.values(functions);
  const total = totals.length;
  const covered = totals.filter((value) => value > 0).length;
  return { covered, total };
};

const aggregateBranchRatio = (entry: CoverageFinalEntry) => {
  const branches = entry.b ?? {};
  let total = 0;
  let covered = 0;
  for (const hits of Object.values(branches)) {
    for (const hit of hits) {
      total += 1;
      if (hit > 0) {
        covered += 1;
      }
    }
  }
  return { covered, total };
};

export async function parseCoverageFinal(coverageFinalPath: string): Promise<SummaryParseResult> {
  const coverage = await readJsonFile<Record<string, CoverageFinalEntry>>(coverageFinalPath);
  const files = new Map<string, SummaryFileRatios>();

  let totalStatementsCovered = 0;
  let totalStatements = 0;
  let totalFunctionsCovered = 0;
  let totalFunctions = 0;
  let totalBranchesCovered = 0;
  let totalBranches = 0;

  for (const [filePath, entry] of Object.entries(coverage)) {
    const statementAgg = aggregateStatementRatio(entry);
    const functionAgg = aggregateFunctionRatio(entry);
    const branchAgg = aggregateBranchRatio(entry);

    totalStatementsCovered += statementAgg.covered;
    totalStatements += statementAgg.total;
    totalFunctionsCovered += functionAgg.covered;
    totalFunctions += functionAgg.total;
    totalBranchesCovered += branchAgg.covered;
    totalBranches += branchAgg.total;

    const statementsRatio = computeRatio(statementAgg.covered, statementAgg.total);
    const functionsRatio = computeRatio(functionAgg.covered, functionAgg.total);
    const branchesRatio = computeRatio(branchAgg.covered, branchAgg.total);

    files.set(toPosix(filePath), {
      statements: statementsRatio,
      // coverage-final only ships statement ratios; reuse them as a proxy for line coverage.
      lines: statementsRatio,
      functions: functionsRatio,
      branches: branchesRatio
    });
  }

  const total: CoverageRatios = {
    statements: computeRatio(totalStatementsCovered, totalStatements),
    // coverage-final lacks aggregated line totals, so fall back to statement coverage.
    lines: computeRatio(totalStatementsCovered, totalStatements),
    functions: computeRatio(totalFunctionsCovered, totalFunctions),
    branches: computeRatio(totalBranchesCovered, totalBranches)
  };

  return { total, files };
}

interface LcovAccumulator {
  path?: string;
  linesFound?: number;
  linesHit?: number;
  branchesFound?: number;
  branchesHit?: number;
  fnFound?: number;
  fnHit?: number;
}

const flushRecord = (acc: LcovAccumulator, output: Map<string, LcovFileRatios>) => {
  if (!acc.path) {
    return;
  }
  output.set(toPosix(acc.path), {
    path: toPosix(acc.path),
    lines: ratio(acc.linesHit, acc.linesFound),
    branches: ratio(acc.branchesHit, acc.branchesFound),
    functions: ratio(acc.fnHit, acc.fnFound)
  });
};

export async function parseLcovFile(lcovPath: string): Promise<Map<string, LcovFileRatios>> {
  const raw = await readFileSafe(lcovPath);
  return parseLcovContent(raw);
}

export function parseLcovContent(raw: string): Map<string, LcovFileRatios> {
  const records = new Map<string, LcovFileRatios>();
  if (!raw.trim()) {
    return records;
  }

  const lines = raw.split(/\r?\n/);
  let current: LcovAccumulator = {};

  const flush = () => {
    flushRecord(current, records);
    current = {};
  };

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      flush();
      current.path = line.slice(3).trim();
    } else if (line.startsWith('LF:')) {
      current.linesFound = Number.parseInt(line.slice(3).trim(), 10);
    } else if (line.startsWith('LH:')) {
      current.linesHit = Number.parseInt(line.slice(3).trim(), 10);
    } else if (line.startsWith('BRF:')) {
      current.branchesFound = Number.parseInt(line.slice(4).trim(), 10);
    } else if (line.startsWith('BRH:')) {
      current.branchesHit = Number.parseInt(line.slice(4).trim(), 10);
    } else if (line.startsWith('FNF:')) {
      current.fnFound = Number.parseInt(line.slice(4).trim(), 10);
    } else if (line.startsWith('FNH:')) {
      current.fnHit = Number.parseInt(line.slice(4).trim(), 10);
    } else if (line === 'end_of_record') {
      flush();
    }
  }

  flush();
  return records;
}

export interface NormalizedPathResult {
  normalized: string;
  outsideRepo: boolean;
}

export function normalizeToRepo(filePath: string, repoRoot: string): NormalizedPathResult {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return { normalized: '', outsideRepo: false };
  }
  const repoRootAbs = resolve(repoRoot);
  const sanitized = trimmed.startsWith('file://') ? trimmed.slice('file://'.length) : trimmed;
  const candidate = toPosix(isAbsolute(sanitized) ? normalizePath(sanitized) : normalizePath(resolve(repoRootAbs, sanitized)));
  const relativePath = toPosix(relative(repoRootAbs, candidate));

  if (!relativePath || relativePath.startsWith('..')) {
    return { normalized: candidate, outsideRepo: true };
  }

  return { normalized: relativePath.replace(/^\.\//, ''), outsideRepo: false };
}
