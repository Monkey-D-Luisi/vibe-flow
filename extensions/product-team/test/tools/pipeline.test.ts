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
import {
  pipelineStartToolDef,
  pipelineStatusToolDef,
  pipelineRetryToolDef,
  pipelineSkipToolDef,
} from '../../src/tools/pipeline.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-03-01T12:00:00.000Z';

describe('pipeline tools', () => {
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
    const generateId = () => `01PIP_${String(++idCounter).padStart(10, '0')}`;
    const now = () => NOW;
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
      projectConfig: { projects: [], activeProject: 'vibe-flow' },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  describe('pipeline.start', () => {
    it('creates a task with pipeline metadata and returns taskId and IDEA status', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'Add dark mode to the app' });

      const details = result.details as { taskId: string; status: string; title: string };
      expect(details.taskId).toBeTruthy();
      expect(details.status).toBe('IDEA');
      expect(details.title).toBe('Add dark mode to the app');
    });

    it('sets pipelineStage=IDEA and pipelineOwner=pm in task metadata', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'New feature idea' });
      const { taskId } = result.details as { taskId: string };

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.pipelineStage).toBe('IDEA');
      expect(meta?.pipelineOwner).toBe('pm');
    });

    it('stores ideaText and pipelineStartedAt in metadata', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'Build a chatbot' });
      const { taskId } = result.details as { taskId: string };

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.ideaText).toBe('Build a chatbot');
      expect(meta?.pipelineStartedAt).toBe(NOW);
    });

    it('tags the task with pipeline and idea tags', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'Tag me' });
      const { taskId } = result.details as { taskId: string };

      const task = deps.taskRepo.getById(taskId);
      expect(task?.tags).toContain('pipeline');
      expect(task?.tags).toContain('idea');
    });

    it('uses projectId from params when provided', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', {
        ideaText: 'Custom project',
        projectId: 'saas-template',
      });
      const { taskId } = result.details as { taskId: string };

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.projectId).toBe('saas-template');
    });

    it('falls back to activeProject when projectId not given', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'Active project test' });
      const { taskId } = result.details as { taskId: string };

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.projectId).toBe('vibe-flow');
    });

    it('logs a task.created event', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'Event log test' });
      const { taskId } = result.details as { taskId: string };

      const events = deps.eventLog.getHistory(taskId);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.eventType === 'task.created')).toBe(true);
    });

    it('truncates idea text to 200 chars for task title', async () => {
      const tool = pipelineStartToolDef(deps);
      const longIdea = 'A'.repeat(300);
      const result = await tool.execute('call-1', { ideaText: longIdea });
      const { title } = result.details as { title: string };
      expect(title.length).toBe(200);
    });

    it('returns valid JSON text content', async () => {
      const tool = pipelineStartToolDef(deps);
      const result = await tool.execute('call-1', { ideaText: 'JSON test' });
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('pipeline.status', () => {
    it('returns empty task list when no pipeline tasks exist', async () => {
      const tool = pipelineStatusToolDef(deps);
      const result = await tool.execute('call-1', {});
      const details = result.details as { tasks: unknown[]; count: number };
      expect(details.tasks).toEqual([]);
      expect(details.count).toBe(0);
    });

    it('returns all pipeline tasks with stage and owner', async () => {
      const startTool = pipelineStartToolDef(deps);
      await startTool.execute('s1', { ideaText: 'Idea A' });
      await startTool.execute('s2', { ideaText: 'Idea B' });

      const statusTool = pipelineStatusToolDef(deps);
      const result = await statusTool.execute('call-1', {});
      const details = result.details as {
        tasks: Array<{ stage: string; owner: string }>;
        count: number;
      };
      expect(details.count).toBe(2);
      expect(details.tasks[0]?.stage).toBe('IDEA');
      expect(details.tasks[0]?.owner).toBe('pm');
    });

    it('returns a single task by taskId', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Single task query' });
      const { taskId } = started.details as { taskId: string };

      const statusTool = pipelineStatusToolDef(deps);
      const result = await statusTool.execute('call-1', { taskId });
      const details = result.details as { tasks: Array<{ id: string }> };
      expect(details.tasks).toHaveLength(1);
      expect(details.tasks[0]?.id).toBe(taskId);
    });

    it('returns error in result when taskId is not found', async () => {
      const tool = pipelineStatusToolDef(deps);
      const result = await tool.execute('call-1', { taskId: 'nonexistent-id' });
      const details = result.details as { tasks: unknown[]; error: string };
      expect(details.tasks).toEqual([]);
      expect(details.error).toMatch(/not found/i);
    });
  });

  describe('pipeline.retry', () => {
    it('resets a pipeline task to its current stage and increments retryCount', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Retry this idea' });
      const { taskId } = started.details as { taskId: string };

      const retryTool = pipelineRetryToolDef(deps);
      const result = await retryTool.execute('call-1', { taskId });
      const details = result.details as { retried: boolean; stage: string };
      expect(details.retried).toBe(true);
      expect(details.stage).toBe('IDEA');

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.retryCount).toBe(1);
    });

    it('retries a specific stage when stage param is provided', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Stage retry' });
      const { taskId } = started.details as { taskId: string };

      const retryTool = pipelineRetryToolDef(deps);
      const result = await retryTool.execute('call-1', { taskId, stage: 'REFINEMENT' });
      const details = result.details as { retried: boolean; stage: string };
      expect(details.retried).toBe(true);
      expect(details.stage).toBe('REFINEMENT');

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.pipelineStage).toBe('REFINEMENT');
      expect(meta?.pipelineOwner).toBe('po');
    });

    it('returns retried=false for a non-existent task', async () => {
      const retryTool = pipelineRetryToolDef(deps);
      const result = await retryTool.execute('call-1', { taskId: 'nonexistent' });
      const details = result.details as { retried: boolean };
      expect(details.retried).toBe(false);
    });
  });

  describe('pipeline.skip', () => {
    it('advances the pipeline to the next stage when skipping', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Skip IDEA stage' });
      const { taskId } = started.details as { taskId: string };

      const skipTool = pipelineSkipToolDef(deps);
      const result = await skipTool.execute('call-1', {
        taskId,
        stage: 'IDEA',
        reason: 'Skipping for testing',
      });
      const details = result.details as {
        skipped: boolean;
        skippedStage: string;
        nextStage: string;
      };
      expect(details.skipped).toBe(true);
      expect(details.skippedStage).toBe('IDEA');
      expect(details.nextStage).toBe('ROADMAP');
    });

    it('stores skip reason and skip flag in task metadata', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Reason stored' });
      const { taskId } = started.details as { taskId: string };

      const skipTool = pipelineSkipToolDef(deps);
      await skipTool.execute('call-1', {
        taskId,
        stage: 'DESIGN',
        reason: 'Backend-only task, no UI',
      });

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.['DESIGN_skipped']).toBe(true);
      expect(meta?.['DESIGN_skipReason']).toBe('Backend-only task, no UI');
    });

    it('updates pipelineOwner to the next stage owner', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Owner update' });
      const { taskId } = started.details as { taskId: string };

      const skipTool = pipelineSkipToolDef(deps);
      await skipTool.execute('call-1', {
        taskId,
        stage: 'IDEA',
        reason: 'Fast forward',
      });

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.pipelineOwner).toBe('pm'); // ROADMAP owner
    });

    it('returns skipped=false when task does not exist', async () => {
      const skipTool = pipelineSkipToolDef(deps);
      const result = await skipTool.execute('call-1', {
        taskId: 'nonexistent',
        stage: 'IDEA',
        reason: 'Will fail',
      });
      const details = result.details as { skipped: boolean };
      expect(details.skipped).toBe(false);
    });

    it('returns skipped=false for the final DONE stage (no next stage)', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'Final stage' });
      const { taskId } = started.details as { taskId: string };

      const skipTool = pipelineSkipToolDef(deps);
      const result = await skipTool.execute('call-1', {
        taskId,
        stage: 'DONE',
        reason: 'Cannot skip DONE',
      });
      const details = result.details as { skipped: boolean; reason: string };
      expect(details.skipped).toBe(false);
      expect(details.reason).toMatch(/No next stage/i);
    });

    it('skipping DESIGN stage advances to IMPLEMENTATION with back-1 as owner', async () => {
      const startTool = pipelineStartToolDef(deps);
      const started = await startTool.execute('s1', { ideaText: 'No design needed' });
      const { taskId } = started.details as { taskId: string };

      const skipTool = pipelineSkipToolDef(deps);
      const result = await skipTool.execute('call-1', {
        taskId,
        stage: 'DESIGN',
        reason: 'Backend-only task',
      });
      const details = result.details as { nextStage: string };
      expect(details.nextStage).toBe('IMPLEMENTATION');

      const task = deps.taskRepo.getById(taskId);
      const meta = task?.metadata as Record<string, unknown>;
      expect(meta?.pipelineOwner).toBe('back-1');
    });
  });
});
