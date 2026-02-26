import type { GatePolicy } from './types.js';

export type TunableGateMetric =
  | 'coverageMinPct'
  | 'lintMaxWarnings'
  | 'complexityMaxCyclomatic';

export interface GatePolicyHistorySample {
  readonly coveragePct?: number;
  readonly lintWarnings?: number;
  readonly maxCyclomatic?: number;
  readonly scope?: string;
  readonly timestamp?: string;
}

export interface GateAutoTuneBounds {
  readonly min: number;
  readonly max: number;
}

export interface GateAutoTuneConfig {
  readonly minSamples?: number;
  readonly smoothingFactor?: number;
  readonly maxDeltas?: Partial<Record<TunableGateMetric, number>>;
  readonly bounds?: Partial<Record<TunableGateMetric, GateAutoTuneBounds>>;
}

export interface GateAutoTuneAdjustment {
  readonly metric: TunableGateMetric;
  readonly before: number;
  readonly after: number;
  readonly median: number;
  readonly samples: number;
}

export interface GateAutoTuneResult {
  readonly applied: boolean;
  readonly basePolicy: GatePolicy;
  readonly tunedPolicy: GatePolicy;
  readonly sampleCount: number;
  readonly adjustments: GateAutoTuneAdjustment[];
  readonly reason?: string;
}

const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_SMOOTHING_FACTOR = 0.25;

const DEFAULT_MAX_DELTAS: Record<TunableGateMetric, number> = {
  coverageMinPct: 5,
  lintMaxWarnings: 10,
  complexityMaxCyclomatic: 5,
};

const DEFAULT_BOUNDS: Record<TunableGateMetric, GateAutoTuneBounds> = {
  coverageMinPct: { min: 50, max: 95 },
  lintMaxWarnings: { min: 0, max: 50 },
  complexityMaxCyclomatic: { min: 5, max: 40 },
};

interface NormalizedConfig {
  readonly minSamples: number;
  readonly smoothingFactor: number;
  readonly maxDeltas: Record<TunableGateMetric, number>;
  readonly bounds: Record<TunableGateMetric, GateAutoTuneBounds>;
}

interface TunableMetricConfig {
  readonly policyKey: TunableGateMetric;
  readonly historyKey: keyof GatePolicyHistorySample;
}

const TUNABLE_METRICS: TunableMetricConfig[] = [
  { policyKey: 'coverageMinPct', historyKey: 'coveragePct' },
  { policyKey: 'lintMaxWarnings', historyKey: 'lintWarnings' },
  { policyKey: 'complexityMaxCyclomatic', historyKey: 'maxCyclomatic' },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundForMetric(metric: TunableGateMetric, value: number): number {
  if (metric === 'lintMaxWarnings') {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return NaN;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function toSafeDelta(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function normalizeBounds(
  metric: TunableGateMetric,
  configBounds?: GateAutoTuneBounds,
): GateAutoTuneBounds {
  const defaults = DEFAULT_BOUNDS[metric];
  if (!configBounds) {
    return defaults;
  }
  const normalizedMin = Number.isFinite(configBounds.min)
    ? configBounds.min
    : defaults.min;
  const normalizedMax = Number.isFinite(configBounds.max)
    ? configBounds.max
    : defaults.max;
  if (normalizedMin > normalizedMax) {
    return defaults;
  }
  return { min: normalizedMin, max: normalizedMax };
}

function normalizeConfig(config?: GateAutoTuneConfig): NormalizedConfig {
  const rawMinSamples = config?.minSamples;
  const minSamples = typeof rawMinSamples === 'number' && Number.isInteger(rawMinSamples)
    ? Math.max(1, rawMinSamples)
    : DEFAULT_MIN_SAMPLES;
  const rawSmoothing = isFiniteNumber(config?.smoothingFactor)
    ? config?.smoothingFactor
    : DEFAULT_SMOOTHING_FACTOR;
  const smoothingFactor = clamp(rawSmoothing, 0, 1);

  const maxDeltas: Record<TunableGateMetric, number> = {
    coverageMinPct: toSafeDelta(config?.maxDeltas?.coverageMinPct ?? DEFAULT_MAX_DELTAS.coverageMinPct),
    lintMaxWarnings: toSafeDelta(config?.maxDeltas?.lintMaxWarnings ?? DEFAULT_MAX_DELTAS.lintMaxWarnings),
    complexityMaxCyclomatic: toSafeDelta(
      config?.maxDeltas?.complexityMaxCyclomatic ?? DEFAULT_MAX_DELTAS.complexityMaxCyclomatic,
    ),
  };

  const bounds: Record<TunableGateMetric, GateAutoTuneBounds> = {
    coverageMinPct: normalizeBounds('coverageMinPct', config?.bounds?.coverageMinPct),
    lintMaxWarnings: normalizeBounds('lintMaxWarnings', config?.bounds?.lintMaxWarnings),
    complexityMaxCyclomatic: normalizeBounds(
      'complexityMaxCyclomatic',
      config?.bounds?.complexityMaxCyclomatic,
    ),
  };

  return {
    minSamples,
    smoothingFactor,
    maxDeltas,
    bounds,
  };
}

function collectMetricValues(
  history: readonly GatePolicyHistorySample[],
  key: keyof GatePolicyHistorySample,
): number[] {
  const values: number[] = [];
  for (const sample of history) {
    const candidate = sample[key];
    if (isFiniteNumber(candidate)) {
      values.push(candidate);
    }
  }
  return values;
}

export function autoTunePolicy(
  basePolicy: GatePolicy,
  history: readonly GatePolicyHistorySample[],
  config?: GateAutoTuneConfig,
): GateAutoTuneResult {
  const normalized = normalizeConfig(config);
  const sampleCount = history.length;
  const tunedPolicy: GatePolicy = { ...basePolicy };
  const adjustments: GateAutoTuneAdjustment[] = [];

  if (sampleCount < normalized.minSamples) {
    return {
      applied: false,
      basePolicy: { ...basePolicy },
      tunedPolicy,
      sampleCount,
      adjustments,
      reason: `Insufficient history samples (${sampleCount}/${normalized.minSamples})`,
    };
  }

  for (const metric of TUNABLE_METRICS) {
    const currentThreshold = tunedPolicy[metric.policyKey];
    if (!isFiniteNumber(currentThreshold)) {
      continue;
    }

    const values = collectMetricValues(history, metric.historyKey);
    if (values.length < normalized.minSamples) {
      continue;
    }

    const metricMedian = median(values);
    if (!isFiniteNumber(metricMedian)) {
      continue;
    }

    const rawThreshold =
      currentThreshold + (metricMedian - currentThreshold) * normalized.smoothingFactor;
    const maxDelta = normalized.maxDeltas[metric.policyKey];
    const boundedDeltaThreshold = clamp(
      rawThreshold,
      currentThreshold - maxDelta,
      currentThreshold + maxDelta,
    );
    const bounds = normalized.bounds[metric.policyKey];
    const boundedThreshold = clamp(
      boundedDeltaThreshold,
      bounds.min,
      bounds.max,
    );
    const roundedThreshold = roundForMetric(metric.policyKey, boundedThreshold);

    if (roundedThreshold === currentThreshold) {
      continue;
    }

    tunedPolicy[metric.policyKey] = roundedThreshold;
    adjustments.push({
      metric: metric.policyKey,
      before: currentThreshold,
      after: roundedThreshold,
      median: Math.round(metricMedian * 100) / 100,
      samples: values.length,
    });
  }

  return {
    applied: adjustments.length > 0,
    basePolicy: { ...basePolicy },
    tunedPolicy,
    sampleCount,
    adjustments,
    reason: adjustments.length === 0 ? 'No tunable metrics produced bounded adjustments' : undefined,
  };
}
