/**
 * Gate data sources.
 *
 * Collects metric values from various sources (file system, environment,
 * injected dependencies) for gate evaluation.
 */

import type { GateMetrics } from './policy.js';

export interface GateSourceDeps {
  /** Pre-computed coverage percentage */
  coveragePct?: number;
  /** Pre-computed lint error count */
  lintErrors?: number;
  /** Pre-computed lint warning count */
  lintWarnings?: number;
  /** Pre-computed max cyclomatic complexity */
  maxCyclomatic?: number;
  /** Whether tests exist */
  testsExist?: boolean;
  /** Whether all tests passed */
  testsPassed?: boolean;
  /** Pre-computed RGR log count */
  rgrLogCount?: number;
  /** Function to load RGR log count (async) */
  loadRgrLogCount?: () => Promise<number>;
  /** Pre-computed accessibility violation count */
  accessibilityViolations?: number;
  /** Pre-computed critical audit vulnerability count */
  auditCritical?: number;
  /** Pre-computed high audit vulnerability count */
  auditHigh?: number;
}

/**
 * Load RGR count from environment variable.
 */
function loadRgrFromEnv(): number | undefined {
  const envVal = process.env.RGR_LOG_COUNT;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Collect gate metrics from all available sources.
 *
 * Priority for RGR count:
 * 1. deps.rgrLogCount (direct injection)
 * 2. deps.loadRgrLogCount() (async loader)
 * 3. RGR_LOG_COUNT environment variable
 */
export async function collectGateMetrics(deps: GateSourceDeps = {}): Promise<GateMetrics> {
  // Determine RGR count
  let rgrCount: number | undefined = deps.rgrLogCount;
  if (rgrCount === undefined && deps.loadRgrLogCount) {
    try {
      rgrCount = await deps.loadRgrLogCount();
    } catch {
      // RGR loader failed - fall through to env variable
    }
  }
  if (rgrCount === undefined) {
    rgrCount = loadRgrFromEnv();
  }

  return {
    coveragePct: deps.coveragePct,
    lintErrors: deps.lintErrors,
    lintWarnings: deps.lintWarnings,
    maxCyclomatic: deps.maxCyclomatic,
    testsExist: deps.testsExist,
    testsPassed: deps.testsPassed,
    rgrCount,
    accessibilityViolations: deps.accessibilityViolations,
    auditCritical: deps.auditCritical,
    auditHigh: deps.auditHigh,
  };
}
