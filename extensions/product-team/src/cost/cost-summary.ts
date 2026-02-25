import type { EventRecord } from '../persistence/event-repository.js';

interface CostPayload extends Record<string, unknown> {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
}

export interface CostSummary {
  readonly totalTokens: number;
  readonly totalDurationMs: number;
  readonly eventCount: number;
}

export interface TaskBudgetWarnings {
  readonly tokenLimitExceeded?: boolean;
  readonly durationLimitExceeded?: boolean;
}

export interface TaskBudget {
  readonly maxTokens?: number;
  readonly maxDurationMs?: number;
  readonly warnings?: TaskBudgetWarnings;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.trunc(value);
}

function asCostPayload(value: unknown): CostPayload {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return {
    inputTokens: asNonNegativeInteger(record.inputTokens),
    outputTokens: asNonNegativeInteger(record.outputTokens),
    durationMs: asNonNegativeInteger(record.durationMs),
  };
}

export function buildCostSummary(events: EventRecord[]): CostSummary {
  let totalTokens = 0;
  let totalDurationMs = 0;
  let eventCount = 0;

  for (const event of events) {
    if (event.eventType !== 'cost.llm' && event.eventType !== 'cost.tool') {
      continue;
    }
    eventCount += 1;

    const payload = asCostPayload(event.payload);
    const inputTokens = payload.inputTokens ?? 0;
    const outputTokens = payload.outputTokens ?? 0;
    const durationMs = payload.durationMs ?? 0;

    totalTokens += inputTokens + outputTokens;
    totalDurationMs += durationMs;
  }

  return {
    totalTokens,
    totalDurationMs,
    eventCount,
  };
}

export function getTaskBudget(metadata: Record<string, unknown>): TaskBudget | null {
  const budget = asRecord(metadata.budget);
  if (!budget) {
    return null;
  }

  const warnings = asRecord(budget.warnings);
  const tokenLimitExceeded = warnings?.tokenLimitExceeded === true;
  const durationLimitExceeded = warnings?.durationLimitExceeded === true;

  return {
    maxTokens: asNonNegativeInteger(budget.maxTokens),
    maxDurationMs: asNonNegativeInteger(budget.maxDurationMs),
    warnings: {
      tokenLimitExceeded,
      durationLimitExceeded,
    },
  };
}

export function applyBudgetWarnings(
  metadata: Record<string, unknown>,
  warnings: TaskBudgetWarnings,
): Record<string, unknown> {
  const budget = asRecord(metadata.budget) ?? {};
  const currentWarnings = asRecord(budget.warnings) ?? {};

  return {
    ...metadata,
    budget: {
      ...budget,
      warnings: {
        ...currentWarnings,
        ...(warnings.tokenLimitExceeded !== undefined
          ? { tokenLimitExceeded: warnings.tokenLimitExceeded }
          : {}),
        ...(warnings.durationLimitExceeded !== undefined
          ? { durationLimitExceeded: warnings.durationLimitExceeded }
          : {}),
      },
    },
  };
}
