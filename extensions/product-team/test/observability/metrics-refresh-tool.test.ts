import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteMetricsRepository } from '../../src/observability/metrics-repository.js';
import { MetricsAggregator } from '../../src/observability/metrics-aggregator.js';
import { metricsRefreshToolDef } from '../../src/observability/metrics-refresh-tool.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { createValidator } from '../../src/schemas/validator.js';

const TEST_NOW = '2026-03-21T10:30:00.000Z';

describe('metricsRefreshToolDef', () => {
  let db: Database.Database;
  let aggregator: MetricsAggregator;
  let idCounter = 0;

  function createDeps(): ToolDeps {
    return {
      db,
      taskRepo: {} as ToolDeps['taskRepo'],
      orchestratorRepo: {} as ToolDeps['orchestratorRepo'],
      leaseRepo: {} as ToolDeps['leaseRepo'],
      eventLog: {} as ToolDeps['eventLog'],
      generateId: () => `id-${String(++idCounter).padStart(4, '0')}`,
      now: () => TEST_NOW,
      validate: createValidator(),
      transitionGuardConfig: { requireCoverageForDone: false, requireLintForDone: false },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;
    const metricsRepo = new SqliteMetricsRepository(db);
    aggregator = new MetricsAggregator({
      db,
      metricsRepo,
      generateId: () => `met-${String(++idCounter).padStart(4, '0')}`,
      now: () => TEST_NOW,
    });
  });

  afterEach(() => {
    db?.close();
  });

  it('returns refresh result with default period (hour)', async () => {
    const deps = createDeps();
    const tool = metricsRefreshToolDef(deps, aggregator);

    const result = await tool.execute('call-1', {});
    const details = result.details as { period: string; metricsComputed: number };

    expect(details.period).toBe('hour');
    expect(details.metricsComputed).toBe(0);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('accepts explicit period parameter', async () => {
    const deps = createDeps();
    const tool = metricsRefreshToolDef(deps, aggregator);

    const result = await tool.execute('call-2', { period: 'day' });
    const details = result.details as { period: string };
    expect(details.period).toBe('day');
  });

  it('returns computed metrics when events exist', async () => {
    // Seed event_log
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'test', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'task.created', 'pm', '{}', ?)`,
    ).run(TEST_NOW);

    const deps = createDeps();
    const tool = metricsRefreshToolDef(deps, aggregator);

    const result = await tool.execute('call-3', { period: 'all' });
    const details = result.details as { metricsComputed: number };
    expect(details.metricsComputed).toBeGreaterThan(0);
  });

  it('has the correct tool metadata', () => {
    const deps = createDeps();
    const tool = metricsRefreshToolDef(deps, aggregator);

    expect(tool.name).toBe('metrics.refresh');
    expect(tool.label).toBe('Refresh Metrics');
    expect(tool.description).toContain('on-demand metrics aggregation');
  });
});
