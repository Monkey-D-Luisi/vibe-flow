import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteMetricsRepository } from '../../src/observability/metrics-repository.js';
import type { AggregatedMetric } from '../../src/observability/metrics-types.js';

describe('SqliteMetricsRepository', () => {
  let db: Database.Database;
  let repo: SqliteMetricsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteMetricsRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  function makeMetric(overrides: Partial<AggregatedMetric> = {}): AggregatedMetric {
    return {
      id: 'met-001',
      metricType: 'agent_activity',
      scope: 'system',
      period: 'hour',
      periodStart: '2026-03-21T10:00:00.000Z',
      value: { pm: 10, 'back-1': 5 },
      computedAt: '2026-03-21T10:05:00.000Z',
      ...overrides,
    };
  }

  describe('upsert', () => {
    it('inserts a new metric', () => {
      const metric = makeMetric();
      repo.upsert(metric);

      const results = repo.getByType('agent_activity');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('met-001');
      expect(results[0].value).toEqual({ pm: 10, 'back-1': 5 });
    });

    it('updates existing metric on same unique key', () => {
      repo.upsert(makeMetric({ value: { pm: 10 } }));
      repo.upsert(makeMetric({
        id: 'met-002',
        value: { pm: 20, qa: 5 },
        computedAt: '2026-03-21T10:10:00.000Z',
      }));

      const results = repo.getByType('agent_activity');
      expect(results).toHaveLength(1);
      expect(results[0].value).toEqual({ pm: 20, qa: 5 });
      expect(results[0].computedAt).toBe('2026-03-21T10:10:00.000Z');
    });

    it('stores different periods for same metric type', () => {
      repo.upsert(makeMetric({ id: 'met-h', period: 'hour' }));
      repo.upsert(makeMetric({ id: 'met-d', period: 'day', periodStart: '2026-03-21T00:00:00.000Z' }));

      const hours = repo.getByType('agent_activity', undefined, 'hour');
      const days = repo.getByType('agent_activity', undefined, 'day');
      expect(hours).toHaveLength(1);
      expect(days).toHaveLength(1);
    });
  });

  describe('getByType', () => {
    beforeEach(() => {
      repo.upsert(makeMetric({ id: 'a1', scope: 'system' }));
      repo.upsert(makeMetric({ id: 'a2', scope: 'agent:pm', periodStart: '2026-03-21T10:00:00.001Z' }));
      repo.upsert(makeMetric({ id: 'a3', metricType: 'cost_summary', scope: 'system', periodStart: '2026-03-21T10:00:00.002Z' }));
    });

    it('filters by metricType only', () => {
      const results = repo.getByType('agent_activity');
      expect(results).toHaveLength(2);
    });

    it('filters by metricType and scope', () => {
      const results = repo.getByType('agent_activity', 'agent:pm');
      expect(results).toHaveLength(1);
      expect(results[0].scope).toBe('agent:pm');
    });

    it('filters by metricType, scope, and period', () => {
      repo.upsert(makeMetric({ id: 'a4', period: 'day', periodStart: '2026-03-21T00:00:00.000Z' }));
      const results = repo.getByType('agent_activity', 'system', 'hour');
      expect(results).toHaveLength(1);
    });

    it('returns results ordered by periodStart DESC', () => {
      repo.upsert(makeMetric({ id: 'x1', periodStart: '2026-03-21T08:00:00.000Z', scope: 'agent:qa' }));
      repo.upsert(makeMetric({ id: 'x2', periodStart: '2026-03-21T12:00:00.000Z', scope: 'agent:dev' }));

      const results = repo.getByType('agent_activity');
      expect(results[0].periodStart >= results[1].periodStart).toBe(true);
    });
  });

  describe('getLatest', () => {
    it('returns most recent metric by computedAt', () => {
      repo.upsert(makeMetric({ id: 'old', computedAt: '2026-03-21T09:00:00.000Z', periodStart: '2026-03-21T09:00:00.000Z' }));
      repo.upsert(makeMetric({ id: 'new', computedAt: '2026-03-21T11:00:00.000Z', periodStart: '2026-03-21T11:00:00.000Z' }));

      const latest = repo.getLatest('agent_activity', 'system');
      expect(latest).not.toBeNull();
      expect(latest!.computedAt).toBe('2026-03-21T11:00:00.000Z');
    });

    it('returns null when no metrics exist', () => {
      const latest = repo.getLatest('cost_summary', 'system');
      expect(latest).toBeNull();
    });
  });

  describe('getLastComputedAt', () => {
    it('returns null when empty', () => {
      expect(repo.getLastComputedAt()).toBeNull();
    });

    it('returns the most recent computed_at across all metrics', () => {
      repo.upsert(makeMetric({ id: 'm1', computedAt: '2026-03-21T08:00:00.000Z' }));
      repo.upsert(makeMetric({ id: 'm2', metricType: 'cost_summary', computedAt: '2026-03-21T12:00:00.000Z', periodStart: '2026-03-21T12:00:00.000Z' }));

      expect(repo.getLastComputedAt()).toBe('2026-03-21T12:00:00.000Z');
    });
  });

  describe('deleteOlderThan', () => {
    it('removes metrics older than cutoff', () => {
      repo.upsert(makeMetric({ id: 'old', computedAt: '2026-03-20T00:00:00.000Z' }));
      repo.upsert(makeMetric({ id: 'new', computedAt: '2026-03-21T12:00:00.000Z', periodStart: '2026-03-21T12:00:00.000Z' }));

      const deleted = repo.deleteOlderThan('2026-03-21T00:00:00.000Z');
      expect(deleted).toBe(1);

      const remaining = repo.getByType('agent_activity');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('new');
    });

    it('returns 0 when nothing to delete', () => {
      expect(repo.deleteOlderThan('2020-01-01T00:00:00.000Z')).toBe(0);
    });
  });
});
