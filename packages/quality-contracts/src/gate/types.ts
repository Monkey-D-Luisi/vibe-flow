/**
 * Quality gate types.
 */

export type GateVerdict = 'pass' | 'fail' | 'warn' | 'skip';

export interface GateCheckResult {
  name: string;
  verdict: GateVerdict;
  actual: number | string | boolean;
  threshold?: number | string | boolean;
  message: string;
}

export interface GateResult {
  verdict: GateVerdict;
  checks: GateCheckResult[];
  summary: string;
  timestamp: string;
}

export interface GatePolicy {
  coverageMinPct?: number;
  lintMaxErrors?: number;
  lintMaxWarnings?: number;
  complexityMaxCyclomatic?: number;
  testsRequired?: boolean;
  testsMustPass?: boolean;
  rgrMaxCount?: number;
}

export interface GatePolicySet {
  major: GatePolicy;
  minor: GatePolicy;
  patch: GatePolicy;
  default: GatePolicy;
}

export const DEFAULT_POLICIES: GatePolicySet = {
  major: {
    coverageMinPct: 80,
    lintMaxErrors: 0,
    lintMaxWarnings: 10,
    complexityMaxCyclomatic: 15,
    testsRequired: true,
    testsMustPass: true,
    rgrMaxCount: 0,
  },
  minor: {
    coverageMinPct: 70,
    lintMaxErrors: 0,
    lintMaxWarnings: 20,
    complexityMaxCyclomatic: 20,
    testsRequired: true,
    testsMustPass: true,
    rgrMaxCount: 2,
  },
  patch: {
    coverageMinPct: 60,
    lintMaxErrors: 0,
    lintMaxWarnings: 30,
    complexityMaxCyclomatic: 25,
    testsRequired: false,
    testsMustPass: true,
    rgrMaxCount: 5,
  },
  default: {
    coverageMinPct: 70,
    lintMaxErrors: 0,
    lintMaxWarnings: 20,
    complexityMaxCyclomatic: 20,
    testsRequired: true,
    testsMustPass: true,
    rgrMaxCount: 2,
  },
};
