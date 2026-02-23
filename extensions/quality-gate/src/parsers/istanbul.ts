/**
 * Istanbul / nyc coverage report parser.
 *
 * Parses both coverage-summary.json and lcov.info formats.
 */

export interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

export interface FileCoverageSummary {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

export interface CoverageSummaryReport {
  total: FileCoverageSummary;
  files: Record<string, FileCoverageSummary>;
}

/**
 * Parse Istanbul coverage-summary.json content.
 */
export function parseCoverageSummary(jsonString: string): CoverageSummaryReport {
  let raw: Record<string, FileCoverageSummary>;
  try {
    raw = JSON.parse(jsonString) as Record<string, FileCoverageSummary>;
  } catch (error) {
    throw new Error('PARSE_ERROR: Failed to parse coverage-summary.json', { cause: error });
  }

  const total = raw['total'];
  if (!total) {
    throw new Error('PARSE_ERROR: Missing "total" key in coverage summary');
  }

  const files: Record<string, FileCoverageSummary> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key !== 'total') {
      files[key] = value;
    }
  }

  return { total, files };
}

export interface LcovRecord {
  file: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
  branchesFound: number;
  branchesHit: number;
}

/**
 * Parse lcov.info text format into structured records.
 */
export function parseLcov(lcovContent: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let current: Partial<LcovRecord> | null = null;

  for (const line of lcovContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('SF:')) {
      current = {
        file: trimmed.slice(3),
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
      };
    } else if (trimmed.startsWith('LF:') && current) {
      current.linesFound = parseInt(trimmed.slice(3), 10);
    } else if (trimmed.startsWith('LH:') && current) {
      current.linesHit = parseInt(trimmed.slice(3), 10);
    } else if (trimmed.startsWith('FNF:') && current) {
      current.functionsFound = parseInt(trimmed.slice(4), 10);
    } else if (trimmed.startsWith('FNH:') && current) {
      current.functionsHit = parseInt(trimmed.slice(4), 10);
    } else if (trimmed.startsWith('BRF:') && current) {
      current.branchesFound = parseInt(trimmed.slice(4), 10);
    } else if (trimmed.startsWith('BRH:') && current) {
      current.branchesHit = parseInt(trimmed.slice(4), 10);
    } else if (trimmed === 'end_of_record' && current) {
      records.push(current as LcovRecord);
      current = null;
    }
  }

  return records;
}

/**
 * Compute overall coverage percentage from lcov records.
 */
export function computeLcovSummary(records: LcovRecord[]): {
  linesPct: number;
  functionsPct: number;
  branchesPct: number;
} {
  let totalLinesFound = 0;
  let totalLinesHit = 0;
  let totalFunctionsFound = 0;
  let totalFunctionsHit = 0;
  let totalBranchesFound = 0;
  let totalBranchesHit = 0;

  for (const r of records) {
    totalLinesFound += r.linesFound;
    totalLinesHit += r.linesHit;
    totalFunctionsFound += r.functionsFound;
    totalFunctionsHit += r.functionsHit;
    totalBranchesFound += r.branchesFound;
    totalBranchesHit += r.branchesHit;
  }

  const pct = (hit: number, found: number): number =>
    found === 0 ? 100 : Math.round((hit / found) * 10000) / 100;

  return {
    linesPct: pct(totalLinesHit, totalLinesFound),
    functionsPct: pct(totalFunctionsHit, totalFunctionsFound),
    branchesPct: pct(totalBranchesHit, totalBranchesFound),
  };
}
