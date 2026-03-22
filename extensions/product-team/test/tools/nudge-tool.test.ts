/**
 * Tests for agent.nudge tool, nudge-engine, and blocked-task-evaluator.
 *
 * Covers all scenarios from the architecture_plan test_plan:
 *  1. nudge-engine sends team.message to each active agent and returns correct NudgeReport
 *  2. scope=blocked only processes tasks exceeding staleThresholdMs
 *  3. nudge-tool rejects invalid scope values via TypeBox
 *  4. dryRun=true returns report without sending messages
 *  5. blocked-task-evaluator identifies stale tasks from pipeline timestamps
 *  6. evaluator proposes retry for retries<max, escalate for exceeded
 *  7. nudge-tool registered via getAllToolDefs
 *  8. e2e: nudge with 2 stale tasks + 1 active agent produces correct report
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { getAllToolDefs } from '../../src/tools/index.js';
import { agentNudgeToolDef } from '../../src/tools/nudge-tool.js';
import { evaluateBlockedTasks } from '../../src/nudge/blocked-task-evaluator.js';
import { executeNudge } from '../../src/nudge/nudge-engine.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { createTaskRecord, createOrchestratorState } from '../../src/domain/task-record.js';
import type { NudgeReport } from '../../src/schemas/nudge.schema.js';

const BASE_TIME = '2026-03-22T12:00:00.000Z';
const BASE_TIME_MS = new Date(BASE_TIME).getTime();

// 35 minutes ago — stale (exceeds 30 min default)
const STALE_TIME = new Date(BASE_TIME_MS - 35 * 60 * 1000).toISOString();
// 10 minutes ago — not stale
const FRESH_TIME = new Date(BASE_TIME_MS - 10 * 60 * 1000).toISOString();

describe('nudge-tool (agent.nudge)', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    const orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);
    const generateId = () => `01TEST${String(++idCounter).padStart(14, '0')}`;
    const now = () => BASE_TIME;
    const eventLog = new EventLog(eventRepo, generateId, now);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      agentConfig: [
        { id: 'pm', name: 'Product Manager' },
        { id: 'back-1', name: 'Backend Developer' },
        { id: 'qa', name: 'QA Engineer' },
      ],
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Helper: create a pipeline task with specific metadata
  // ────────────────────────────────────────────────────────────────────────────
  function createPipelineTask(
    id: string,
    stage: string,
    stageStartedAt: string,
    retryCount = 0,
    pipelineOwner = 'back-1',
  ) {
    const task = createTaskRecord(
      {
        title: `Test pipeline task ${id}`,
        scope: 'minor',
        tags: ['pipeline', 'idea'],
        metadata: {
          pipelineStage: stage,
          pipelineOwner,
          [`${stage}_startedAt`]: stageStartedAt,
          [`${stage}_retryCount`]: retryCount,
        },
      },
      id,
      BASE_TIME,
    );
    const orchState = createOrchestratorState(task.id, BASE_TIME);
    deps.taskRepo.create(task, orchState);
    return task;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. nudge-engine sends team.message to each active agent
  // ────────────────────────────────────────────────────────────────────────────
  describe('scope=all (default)', () => {
    it('sends a message to every configured agent and returns NudgeReport', async () => {
      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', {});

      const report = result.details as NudgeReport;
      expect(report.nudgedAgents).toHaveLength(3);
      expect(report.nudgedAgents.map((a) => a.agentId)).toEqual(
        expect.arrayContaining(['pm', 'back-1', 'qa']),
      );
      expect(report.nudgedAgents.every((a) => a.status === 'nudged')).toBe(true);
      expect(report.dryRun).toBe(false);
      expect(report.timestamp).toBe(BASE_TIME);
    });

    it('stores messages in agent_messages table for each agent', async () => {
      const tool = agentNudgeToolDef(deps);
      await tool.execute('call-1', {});

      const rows = db
        .prepare("SELECT to_agent FROM agent_messages WHERE from_agent = 'nudge-engine'")
        .all() as Array<{ to_agent: string }>;

      const recipients = rows.map((r) => r.to_agent);
      expect(recipients).toContain('pm');
      expect(recipients).toContain('back-1');
      expect(recipients).toContain('qa');
    });

    it('returns message text mentioning the agent ID', async () => {
      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', {});
      const report = result.details as NudgeReport;
      for (const entry of report.nudgedAgents) {
        expect(entry.message).toContain(entry.agentId);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. scope=blocked only processes tasks exceeding staleThresholdMs
  // ────────────────────────────────────────────────────────────────────────────
  describe('scope=blocked', () => {
    it('only nudges owners of stale tasks, ignores fresh tasks', async () => {
      createPipelineTask('stale-task-1', 'IMPLEMENTATION', STALE_TIME, 0, 'back-1');
      createPipelineTask('fresh-task-1', 'QA', FRESH_TIME, 0, 'qa');

      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', { scope: 'blocked' });

      const report = result.details as NudgeReport;
      // back-1 owns the stale task; qa's task is fresh
      const nudgedIds = report.nudgedAgents.map((a) => a.agentId);
      expect(nudgedIds).toContain('back-1');
      expect(nudgedIds).not.toContain('qa');
    });

    it('returns blockedTasks list with only stale entries', async () => {
      createPipelineTask('stale-task-2', 'IMPLEMENTATION', STALE_TIME, 0, 'back-1');
      createPipelineTask('fresh-task-2', 'QA', FRESH_TIME, 0, 'qa');

      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', { scope: 'blocked' });

      const report = result.details as NudgeReport;
      expect(report.blockedTasks).toHaveLength(1);
      expect(report.blockedTasks[0].taskId).toBe('stale-task-2');
      expect(report.blockedTasks[0].stage).toBe('IMPLEMENTATION');
      expect(report.blockedTasks[0].staleDurationMs).toBeGreaterThan(0);
    });

    it('respects custom staleThresholdMs', async () => {
      // 10-minute-old task — stale if threshold is 5 min
      createPipelineTask('mild-stale', 'DESIGN', FRESH_TIME, 0, 'back-1');

      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', {
        scope: 'blocked',
        staleThresholdMs: 5 * 60 * 1000, // 5 minutes
      });

      const report = result.details as NudgeReport;
      expect(report.blockedTasks.some((t) => t.taskId === 'mild-stale')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. nudge-tool rejects invalid scope values via TypeBox
  // ────────────────────────────────────────────────────────────────────────────
  describe('input validation', () => {
    it('throws a validation error when scope is an invalid value', async () => {
      const tool = agentNudgeToolDef(deps);
      await expect(
        tool.execute('call-bad', { scope: 'invalid-scope' }),
      ).rejects.toThrow();
    });

    it('accepts valid scope values: all, blocked, active', async () => {
      const tool = agentNudgeToolDef(deps);
      for (const scope of ['all', 'blocked', 'active'] as const) {
        await expect(tool.execute('call-valid', { scope })).resolves.toBeDefined();
      }
    });

    it('accepts agentIds array override', async () => {
      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', { agentIds: ['pm'] });
      const report = result.details as NudgeReport;
      expect(report.nudgedAgents).toHaveLength(1);
      expect(report.nudgedAgents[0].agentId).toBe('pm');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. dryRun=true returns report without sending messages
  // ────────────────────────────────────────────────────────────────────────────
  describe('dryRun mode', () => {
    it('returns report with status=dry-run for all agents', async () => {
      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', { dryRun: true });
      const report = result.details as NudgeReport;

      expect(report.dryRun).toBe(true);
      expect(report.nudgedAgents.every((a) => a.status === 'dry-run')).toBe(true);
    });

    it('does NOT insert any messages into agent_messages table', async () => {
      const tool = agentNudgeToolDef(deps);
      await tool.execute('call-1', { dryRun: true });

      const count = (
        db
          .prepare("SELECT COUNT(*) as cnt FROM agent_messages WHERE from_agent = 'nudge-engine'")
          .get() as { cnt: number }
      ).cnt;
      expect(count).toBe(0);
    });

    it('still detects blocked tasks in dryRun', async () => {
      createPipelineTask('stale-dry', 'IMPLEMENTATION', STALE_TIME, 0, 'back-1');

      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-1', { dryRun: true });
      const report = result.details as NudgeReport;

      expect(report.blockedTasks.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5 & 6. blocked-task-evaluator unit tests
  // ────────────────────────────────────────────────────────────────────────────
  describe('blocked-task-evaluator', () => {
    it('identifies stale tasks from pipeline metadata timestamps', () => {
      createPipelineTask('stale-eval-1', 'IMPLEMENTATION', STALE_TIME, 0, 'back-1');
      createPipelineTask('fresh-eval-1', 'QA', FRESH_TIME, 0, 'qa');

      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });

      expect(blocked).toHaveLength(1);
      expect(blocked[0].taskId).toBe('stale-eval-1');
      expect(blocked[0].staleDurationMs).toBeGreaterThanOrEqual(35 * 60 * 1000 - 1000);
    });

    it('proposes retry when retryCount < maxRetries (default 3)', () => {
      createPipelineTask('retry-task', 'IMPLEMENTATION', STALE_TIME, 1, 'back-1');
      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });
      const entry = blocked.find((t) => t.taskId === 'retry-task');
      expect(entry?.proposedAction).toBe('retry');
    });

    it('proposes escalate when retryCount >= maxRetries', () => {
      createPipelineTask('escalate-task', 'IMPLEMENTATION', STALE_TIME, 3, 'back-1');
      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });
      const entry = blocked.find((t) => t.taskId === 'escalate-task');
      expect(entry?.proposedAction).toBe('escalate');
    });

    it('proposes skip when retryCount >= 2*maxRetries', () => {
      createPipelineTask('skip-task', 'IMPLEMENTATION', STALE_TIME, 7, 'back-1');
      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });
      const entry = blocked.find((t) => t.taskId === 'skip-task');
      expect(entry?.proposedAction).toBe('skip');
    });

    it('skips DONE stage tasks', () => {
      createPipelineTask('done-task', 'DONE', STALE_TIME, 0, 'system');
      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });
      expect(blocked.find((t) => t.taskId === 'done-task')).toBeUndefined();
    });

    it('returns empty array when no pipeline tasks exist', () => {
      const blocked = evaluateBlockedTasks(deps.taskRepo, { nowMs: BASE_TIME_MS });
      expect(blocked).toEqual([]);
    });

    it('uses custom staleThresholdMs', () => {
      createPipelineTask('custom-threshold', 'IMPLEMENTATION', FRESH_TIME, 0, 'back-1');
      // 10-min-old task stale under 5 min threshold
      const blocked = evaluateBlockedTasks(deps.taskRepo, {
        nowMs: BASE_TIME_MS,
        staleThresholdMs: 5 * 60 * 1000,
      });
      expect(blocked.find((t) => t.taskId === 'custom-threshold')).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. nudge-tool registered via getAllToolDefs
  // ────────────────────────────────────────────────────────────────────────────
  describe('tool registration', () => {
    it('agent.nudge is included in getAllToolDefs', () => {
      const tools = getAllToolDefs(deps);
      const names = tools.map((t) => t.name);
      expect(names).toContain('agent.nudge');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8. e2e: nudge with 2 stale tasks + 1 active agent → correct report
  // ────────────────────────────────────────────────────────────────────────────
  describe('e2e: 2 stale tasks + nudge all', () => {
    it('produces correct report with all expected fields', async () => {
      createPipelineTask('e2e-stale-1', 'IMPLEMENTATION', STALE_TIME, 0, 'back-1');
      createPipelineTask('e2e-stale-2', 'DESIGN', STALE_TIME, 3, 'qa');
      createPipelineTask('e2e-fresh-1', 'QA', FRESH_TIME, 0, 'qa');

      const report = await executeNudge(deps, {});

      // All 3 configured agents should be nudged
      expect(report.nudgedAgents).toHaveLength(3);
      expect(report.nudgedAgents.every((a) => a.status === 'nudged')).toBe(true);

      // 2 stale tasks detected
      expect(report.blockedTasks).toHaveLength(2);
      const taskIds = report.blockedTasks.map((t) => t.taskId);
      expect(taskIds).toContain('e2e-stale-1');
      expect(taskIds).toContain('e2e-stale-2');

      // Actions based on retry counts
      const stale1 = report.blockedTasks.find((t) => t.taskId === 'e2e-stale-1');
      const stale2 = report.blockedTasks.find((t) => t.taskId === 'e2e-stale-2');
      expect(stale1?.proposedAction).toBe('retry');
      expect(stale2?.proposedAction).toBe('escalate');

      // Required report fields
      expect(report.timestamp).toBe(BASE_TIME);
      expect(report.dryRun).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // scope=active: only nudge agents with assigned tasks
  // ────────────────────────────────────────────────────────────────────────────
  describe('scope=active', () => {
    it('only nudges agents with an assigned task', async () => {
      // Assign a task to 'pm'
      const taskId = `01ACTIVE${String(++idCounter).padStart(12, '0')}`;
      const task = createTaskRecord(
        { title: 'Assigned task', scope: 'minor', tags: ['test'], metadata: {} },
        taskId,
        BASE_TIME,
      );
      const orchState = createOrchestratorState(task.id, BASE_TIME);
      const savedTask = deps.taskRepo.create(task, orchState);
      deps.taskRepo.update(savedTask.id, { assignee: 'pm' }, savedTask.rev, BASE_TIME);

      const tool = agentNudgeToolDef(deps);
      const result = await tool.execute('call-active', { scope: 'active' });
      const report = result.details as NudgeReport;

      const ids = report.nudgedAgents.map((a) => a.agentId);
      expect(ids).toContain('pm');
      // back-1 and qa have no assignments
      expect(ids).not.toContain('back-1');
      expect(ids).not.toContain('qa');
    });
  });
});
