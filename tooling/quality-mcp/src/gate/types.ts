export type GateScope = 'minor' | 'major';

export type GateSource = 'artifacts' | 'tools';

export interface GateThresholds {
  coverageMinor: number;
  coverageMajor: number;
  maxAvgCyclomatic: number;
  maxFileCyclomatic: number;
  allowWarnings: boolean;
}

export interface GatePaths {
  tests: string;
  coverage: string;
  lint: string;
  complexity: string;
}

export interface GateMetrics {
  tests: {
    total: number;
    failed: number;
  };
  coverage: {
    lines: number;
  };
  lint: {
    errors: number;
    warnings: number;
  };
  complexity: {
    avgCyclomatic: number;
    maxCyclomatic: number;
  };
}

export type GateViolationCode =
  | 'TESTS_FAILED'
  | 'COVERAGE_BELOW'
  | 'LINT_ERRORS'
  | 'COMPLEXITY_HIGH'
  | 'RGR_MISSING';

export interface GateViolation {
  code: GateViolationCode;
  message: string;
}

export interface GateResult {
  passed: boolean;
  metrics: GateMetrics;
  violations: GateViolation[];
}
