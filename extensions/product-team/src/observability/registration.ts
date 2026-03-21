/**
 * Observability Registration (EP14)
 *
 * Single entry point for setting up all observability infrastructure.
 * Called from index.ts with minimal LOC footprint.
 */

import type Database from 'better-sqlite3';
import { SqliteMetricsRepository } from './metrics-repository.js';
import { MetricsAggregator } from './metrics-aggregator.js';

export interface ObservabilitySetupDeps {
  readonly db: Database.Database;
  readonly generateId: () => string;
  readonly now: () => string;
}

export interface ObservabilityResult {
  readonly aggregator: MetricsAggregator;
  readonly metricsRepo: SqliteMetricsRepository;
  startCron(): void;
  stopCron(): void;
}

export function setupObservability(deps: ObservabilitySetupDeps): ObservabilityResult {
  const metricsRepo = new SqliteMetricsRepository(deps.db);
  const aggregator = new MetricsAggregator({
    db: deps.db,
    metricsRepo,
    generateId: deps.generateId,
    now: deps.now,
  });

  return {
    aggregator,
    metricsRepo,
    startCron: () => aggregator.startCron(),
    stopCron: () => aggregator.stopCron(),
  };
}
