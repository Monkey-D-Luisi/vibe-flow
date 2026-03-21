import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteMetricsRepository } from '../../src/observability/metrics-repository.js';
import { MetricsAggregator } from '../../src/observability/metrics-aggregator.js';

const TEST_NOW = '2026-03-21T10:30:00.000Z';

describe('MetricsAggregator', () => {
  let db: Database.Database;
  let metricsRepo: SqliteMetricsRepository;
  let aggregator: MetricsAggregator;
  let idCounter = 0;

  beforeEach(() => {
    db = createTestDatabase();
    metricsRepo = new SqliteMetricsRepository(db);
    idCounter = 0;
    aggregator = new MetricsAggregator({
      db,
      metricsRepo,
      generateId: () => `met-${String(++idCounter).padStart(4, '0')}`,
      now: () => TEST_NOW,
    });
  });

  afterEach(() => {
    aggregator.stopCron();
    db?.close();
  });

  /** Insert a task record (required for FK constraint on event_log). */
  function insertTask(taskId: string): void {
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES (?, 'test task', 'in_progress', 'minor', ?, ?)`,
    ).run(taskId, TEST_NOW, TEST_NOW);
  }

  /** Insert an event into event_log. */
  function insertEvent(
    id: string,
    taskId: string,
    eventType: string,
    agentId: string | null,
    payload: Record<string, unknown>,
    createdAt: string = TEST_NOW,
  ): void {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, taskId, eventType, agentId, JSON.stringify(payload), createdAt);
  }

  describe('refresh (empty database)', () => {
    it('returns zero metrics when no events exist', () => {
      const result = aggregator.refresh('hour');
      expect(result.metricsComputed).toBe(0);
      expect(result.period).toBe('hour');
      expect(result.computedAt).toBe(TEST_NOW);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('agent_activity aggregation', () => {
    it('counts events per agent', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {});
      insertEvent('e2', 't1', 'task.updated', 'pm', {});
      insertEvent('e3', 't1', 'task.transition', 'back-1', {});

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'hour');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ pm: 2, 'back-1': 1 });
    });

    it('attributes null agent_id to system', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'session.recovered', null, {});

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'hour');
      expect(metrics[0].value).toEqual({ system: 1 });
    });
  });

  describe('event_type_count aggregation', () => {
    it('counts events by type', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {});
      insertEvent('e2', 't1', 'task.transition', 'pm', {});
      insertEvent('e3', 't1', 'task.transition', 'back-1', {});
      insertEvent('e4', 't1', 'cost.llm', 'back-1', {});

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('event_type_count', 'system', 'hour');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({
        'task.created': 1,
        'task.transition': 2,
        'cost.llm': 1,
      });
    });
  });

  describe('pipeline_throughput aggregation', () => {
    it('counts completed stages', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'pipeline.stage.completed', 'pm', { stage: 'IDEA', durationMs: 5000 });
      insertEvent('e2', 't1', 'pipeline.stage.completed', 'back-1', { stage: 'IMPLEMENTATION', durationMs: 60000 });
      insertEvent('e3', 't1', 'pipeline.stage.completed', 'back-1', { stage: 'IMPLEMENTATION', durationMs: 30000 });

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('pipeline_throughput', 'system', 'hour');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ IDEA: 1, IMPLEMENTATION: 2 });
    });

    it('skips when no pipeline events exist', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {});

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('pipeline_throughput');
      expect(metrics).toHaveLength(0);
    });
  });

  describe('cost_summary aggregation', () => {
    it('sums tokens by agent', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'cost.llm', 'pm', { inputTokens: 100, outputTokens: 50 });
      insertEvent('e2', 't1', 'cost.llm', 'pm', { inputTokens: 200, outputTokens: 100 });
      insertEvent('e3', 't1', 'cost.llm', 'back-1', { inputTokens: 500, outputTokens: 300 });

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('cost_summary', 'system', 'hour');
      expect(metrics).toHaveLength(1);

      const value = metrics[0].value as {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        byAgent: Record<string, { inputTokens: number; outputTokens: number; calls: number }>;
      };
      expect(value.totalInputTokens).toBe(800);
      expect(value.totalOutputTokens).toBe(450);
      expect(value.totalTokens).toBe(1250);
      expect(value.byAgent['pm']).toEqual({ inputTokens: 300, outputTokens: 150, calls: 2 });
      expect(value.byAgent['back-1']).toEqual({ inputTokens: 500, outputTokens: 300, calls: 1 });
    });

    it('handles missing token fields gracefully', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'cost.llm', 'pm', {});

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('cost_summary', 'system', 'hour');
      expect(metrics).toHaveLength(1);
      const value = metrics[0].value as { totalTokens: number };
      expect(value.totalTokens).toBe(0);
    });
  });

  describe('stage_duration aggregation', () => {
    it('computes average duration per stage', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'pipeline.stage.completed', 'pm', { stage: 'IDEA', durationMs: 3000 });
      insertEvent('e2', 't1', 'pipeline.stage.completed', 'pm', { stage: 'IDEA', durationMs: 5000 });
      insertEvent('e3', 't1', 'pipeline.stage.completed', 'back-1', { stage: 'IMPLEMENTATION', durationMs: 60000 });

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('stage_duration', 'system', 'hour');
      expect(metrics).toHaveLength(1);

      const value = metrics[0].value as Record<string, { avgDurationMs: number; count: number }>;
      expect(value['IDEA']).toEqual({ avgDurationMs: 4000, count: 2 });
      expect(value['IMPLEMENTATION']).toEqual({ avgDurationMs: 60000, count: 1 });
    });
  });

  describe('period filtering', () => {
    it('hour period only includes events from current hour', () => {
      insertTask('t1');
      // Event in current hour (10:xx) -- should be included
      insertEvent('e1', 't1', 'task.created', 'pm', {}, '2026-03-21T10:15:00.000Z');
      // Event from previous hour (09:xx) -- should be excluded
      insertEvent('e2', 't1', 'task.created', 'qa', {}, '2026-03-21T09:30:00.000Z');

      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'hour');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ pm: 1 });
    });

    it('day period includes events from midnight', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {}, '2026-03-21T01:00:00.000Z');
      insertEvent('e2', 't1', 'task.created', 'qa', {}, '2026-03-21T10:15:00.000Z');
      // Yesterday -- excluded
      insertEvent('e3', 't1', 'task.created', 'devops', {}, '2026-03-20T23:59:59.000Z');

      aggregator.refresh('day');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'day');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ pm: 1, qa: 1 });
    });

    it('all period includes everything', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {}, '2025-01-01T00:00:00.000Z');
      insertEvent('e2', 't1', 'task.created', 'qa', {}, '2026-03-21T10:15:00.000Z');

      aggregator.refresh('all');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'all');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ pm: 1, qa: 1 });
    });
  });

  describe('cron lifecycle', () => {
    it('starts and stops without errors', () => {
      aggregator.startCron();
      // No assertion needed -- just verify no exception
      aggregator.stopCron();
    });

    it('stopCron is idempotent', () => {
      aggregator.stopCron();
      aggregator.stopCron();
    });
  });

  describe('multiple refresh calls', () => {
    it('updates the same metric on subsequent refreshes', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {});
      aggregator.refresh('hour');

      // Add more events
      insertEvent('e2', 't1', 'task.updated', 'pm', {});
      aggregator.refresh('hour');

      const metrics = metricsRepo.getByType('agent_activity', 'system', 'hour');
      // Should be 1 metric (upserted), not 2
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toEqual({ pm: 2 });
    });
  });

  describe('all 5 metric types', () => {
    it('computes all metrics in a single refresh call', () => {
      insertTask('t1');
      insertEvent('e1', 't1', 'task.created', 'pm', {});
      insertEvent('e2', 't1', 'pipeline.stage.completed', 'pm', { stage: 'IDEA', durationMs: 5000 });
      insertEvent('e3', 't1', 'cost.llm', 'pm', { inputTokens: 100, outputTokens: 50 });

      const result = aggregator.refresh('hour');

      expect(result.metricsComputed).toBe(5);
      expect(metricsRepo.getByType('agent_activity')).toHaveLength(1);
      expect(metricsRepo.getByType('event_type_count')).toHaveLength(1);
      expect(metricsRepo.getByType('pipeline_throughput')).toHaveLength(1);
      expect(metricsRepo.getByType('cost_summary')).toHaveLength(1);
      expect(metricsRepo.getByType('stage_duration')).toHaveLength(1);
    });
  });
});
