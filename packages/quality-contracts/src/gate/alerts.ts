import type { GatePolicyHistorySample } from './auto-tune.js';

export type GateAlertMetric = 'coverageDropPct' | 'complexityRise';

export interface GateAlertThresholds {
  readonly coverageDropPct?: number;
  readonly complexityRise?: number;
}

export interface GateAlertNoiseConfig {
  readonly cooldownEvents?: number;
}

export interface GateAlertConfig {
  readonly thresholds?: GateAlertThresholds;
  readonly noise?: GateAlertNoiseConfig;
}

export interface GateRegressionAlert {
  readonly key: string;
  readonly metric: GateAlertMetric;
  readonly scope: string;
  readonly direction: 'decrease' | 'increase';
  readonly baseline: number;
  readonly observed: number;
  readonly delta: number;
  readonly threshold: number;
  readonly reason: string;
}

export interface GateRegressionAlertSuppression {
  readonly key: string;
  readonly metric: GateAlertMetric;
  readonly reason: string;
}

export interface GateRegressionAlertBaseline {
  coveragePct?: number;
  maxCyclomatic?: number;
  scope?: string;
  timestamp?: string;
}

export interface GateRegressionAlertResult {
  readonly enabled: true;
  readonly evaluatedAt: string;
  readonly thresholds: Required<GateAlertThresholds>;
  readonly cooldownEvents: number;
  readonly baseline: GateRegressionAlertBaseline | null;
  readonly alerts: GateRegressionAlert[];
  readonly emittedKeys: string[];
  readonly suppressed: GateRegressionAlertSuppression[];
}

interface OrderedSample {
  readonly sample: GatePolicyHistorySample;
  readonly score: number;
}

interface NormalizedConfig {
  readonly thresholds: Required<GateAlertThresholds>;
  readonly cooldownEvents: number;
}

const DEFAULT_THRESHOLDS: Required<GateAlertThresholds> = {
  coverageDropPct: 5,
  complexityRise: 3,
};

const DEFAULT_COOLDOWN_EVENTS = 5;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNonNegative(value: unknown, fallback: number): number {
  if (!isFiniteNumber(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeCooldown(value: unknown): number {
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1) {
    return DEFAULT_COOLDOWN_EVENTS;
  }
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSampleScore(sample: GatePolicyHistorySample, fallbackIndex: number): number {
  if (typeof sample.timestamp === 'string') {
    const parsed = Date.parse(sample.timestamp);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallbackIndex;
}

function orderByRecency(history: readonly GatePolicyHistorySample[]): GatePolicyHistorySample[] {
  const scored: OrderedSample[] = history.map((sample, index) => ({
    sample,
    score: buildSampleScore(sample, index),
  }));
  scored.sort((left, right) => right.score - left.score);
  return scored.map((entry) => entry.sample);
}

function normalizeConfig(config?: GateAlertConfig): NormalizedConfig {
  return {
    thresholds: {
      coverageDropPct: normalizeNonNegative(
        config?.thresholds?.coverageDropPct,
        DEFAULT_THRESHOLDS.coverageDropPct,
      ),
      complexityRise: normalizeNonNegative(
        config?.thresholds?.complexityRise,
        DEFAULT_THRESHOLDS.complexityRise,
      ),
    },
    cooldownEvents: normalizeCooldown(config?.noise?.cooldownEvents),
  };
}

function toKey(metric: GateAlertMetric, scope: string, baseline: number, observed: number, threshold: number): string {
  return [
    metric,
    scope,
    round2(baseline),
    round2(observed),
    round2(threshold),
  ].join(':');
}

function collectRecentAlertKeys(
  orderedHistory: readonly GatePolicyHistorySample[],
  cooldownEvents: number,
): Set<string> {
  const keys = new Set<string>();
  for (const sample of orderedHistory.slice(0, cooldownEvents)) {
    if (!Array.isArray(sample.alertKeys)) {
      continue;
    }
    for (const key of sample.alertKeys) {
      if (typeof key === 'string' && key.length > 0) {
        keys.add(key);
      }
    }
  }
  return keys;
}

function toBaseline(sample: GatePolicyHistorySample | undefined): GateRegressionAlertBaseline | null {
  if (!sample) {
    return null;
  }

  const baseline: GateRegressionAlertBaseline = {};
  if (isFiniteNumber(sample.coveragePct)) {
    baseline.coveragePct = round2(sample.coveragePct);
  }
  if (isFiniteNumber(sample.maxCyclomatic)) {
    baseline.maxCyclomatic = round2(sample.maxCyclomatic);
  }
  if (typeof sample.scope === 'string' && sample.scope.length > 0) {
    baseline.scope = sample.scope;
  }
  if (typeof sample.timestamp === 'string' && sample.timestamp.length > 0) {
    baseline.timestamp = sample.timestamp;
  }

  if (
    baseline.coveragePct === undefined
    && baseline.maxCyclomatic === undefined
    && baseline.scope === undefined
    && baseline.timestamp === undefined
  ) {
    return null;
  }

  return baseline;
}

function addCandidate(
  result: {
    alerts: GateRegressionAlert[];
    suppressed: GateRegressionAlertSuppression[];
    emittedKeys: string[];
  },
  recentKeys: Set<string>,
  candidate: GateRegressionAlert,
): void {
  if (recentKeys.has(candidate.key)) {
    result.suppressed.push({
      key: candidate.key,
      metric: candidate.metric,
      reason: `Suppressed duplicate alert key within cooldown window (${candidate.key})`,
    });
    return;
  }
  result.alerts.push(candidate);
  result.emittedKeys.push(candidate.key);
}

export function evaluateRegressionAlerts(
  current: Pick<GatePolicyHistorySample, 'coveragePct' | 'maxCyclomatic'>,
  history: readonly GatePolicyHistorySample[],
  scope: string,
  config?: GateAlertConfig,
  evaluatedAt?: string,
): GateRegressionAlertResult {
  const normalized = normalizeConfig(config);
  const orderedHistory = orderByRecency(history);
  const baselineSample = orderedHistory[0];
  const baseline = toBaseline(baselineSample);
  const recentAlertKeys = collectRecentAlertKeys(orderedHistory, normalized.cooldownEvents);

  const mutable = {
    alerts: [] as GateRegressionAlert[],
    suppressed: [] as GateRegressionAlertSuppression[],
    emittedKeys: [] as string[],
  };

  if (baseline && isFiniteNumber(baseline.coveragePct) && isFiniteNumber(current.coveragePct)) {
    const delta = round2(baseline.coveragePct - current.coveragePct);
    const threshold = round2(normalized.thresholds.coverageDropPct);
    if (delta >= threshold) {
      const key = toKey('coverageDropPct', scope, baseline.coveragePct, current.coveragePct, threshold);
      addCandidate(
        mutable,
        recentAlertKeys,
        {
          key,
          metric: 'coverageDropPct',
          scope,
          direction: 'decrease',
          baseline: round2(baseline.coveragePct),
          observed: round2(current.coveragePct),
          delta,
          threshold,
          reason: `Coverage dropped by ${delta} from baseline ${round2(
            baseline.coveragePct,
          )} to ${round2(current.coveragePct)} (threshold ${threshold})`,
        },
      );
    }
  }

  if (baseline && isFiniteNumber(baseline.maxCyclomatic) && isFiniteNumber(current.maxCyclomatic)) {
    const delta = round2(current.maxCyclomatic - baseline.maxCyclomatic);
    const threshold = round2(normalized.thresholds.complexityRise);
    if (delta >= threshold) {
      const key = toKey(
        'complexityRise',
        scope,
        baseline.maxCyclomatic,
        current.maxCyclomatic,
        threshold,
      );
      addCandidate(
        mutable,
        recentAlertKeys,
        {
          key,
          metric: 'complexityRise',
          scope,
          direction: 'increase',
          baseline: round2(baseline.maxCyclomatic),
          observed: round2(current.maxCyclomatic),
          delta,
          threshold,
          reason: `Max cyclomatic complexity rose by ${delta} from baseline ${round2(
            baseline.maxCyclomatic,
          )} to ${round2(current.maxCyclomatic)} (threshold ${threshold})`,
        },
      );
    }
  }

  return {
    enabled: true,
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
    thresholds: normalized.thresholds,
    cooldownEvents: normalized.cooldownEvents,
    baseline,
    alerts: mutable.alerts,
    emittedKeys: mutable.emittedKeys,
    suppressed: mutable.suppressed,
  };
}
