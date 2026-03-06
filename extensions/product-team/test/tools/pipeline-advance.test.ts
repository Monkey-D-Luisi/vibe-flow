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
import { pipelineAdvanceToolDef, pipelineMetricsToolDef, buildStageSpawnMessage } from '../../src/tools/pipeline-advance.js';
import { pipelineStartToolDef } from '../../src/tools/pipeline.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-03-01T12:00:00.000Z';

describe('pipeline-advance tools', () => {
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
    const generateId = () => `01ADV_${String(++idCounter).padStart(10, '0')}`;
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

  /** Helper: create a pipeline task at a given stage */
  async function createPipelineTask(stage: string, extraMeta?: Record<string, unknown>): Promise<string> {
    const startTool = pipelineStartToolDef(deps);
    const result = await startTool.execute('setup', { ideaText: 'Test pipeline advance' });
    const details = result.details as { taskId: string };
    const taskId = details.taskId;

    // Directly set metadata to desired stage
    const task = deps.taskRepo.getById(taskId)!;
    const meta = { ...(task.metadata as Record<string, unknown>), pipelineStage: stage, [`${stage}_startedAt`]: NOW, ...extraMeta };
    deps.taskRepo.update(taskId, { metadata: meta }, task.rev, NOW);

    // Sync pipeline_stage column
    try {
      db.prepare('UPDATE task_records SET pipeline_stage = ? WHERE id = ?').run(stage, taskId);
    } catch { /* column may not exist */ }

    return taskId;
  }

  describe('pipeline.advance', () => {
    it('advances a task from IDEA to ROADMAP', async () => {
      const taskId = await createPipelineTask('IDEA');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c1', { taskId });
      const d = result.details as { advanced: boolean; previousStage: string; currentStage: string; owner: string };

      expect(d.advanced).toBe(true);
      expect(d.previousStage).toBe('IDEA');
      expect(d.currentStage).toBe('ROADMAP');
      expect(d.owner).toBe('pm');
    });

    it('returns false for non-existent task', async () => {
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c2', { taskId: 'does-not-exist' });
      const d = result.details as { advanced: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.reason).toBe('Task not found');
    });

    it('returns false when already at final stage', async () => {
      const taskId = await createPipelineTask('DONE');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c3', { taskId });
      const d = result.details as { advanced: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.reason).toContain('final stage');
    });

    it('enforces per-stage retry limit', async () => {
      deps.orchestratorConfig = { maxRetriesPerStage: 1 };
      const taskId = await createPipelineTask('IMPLEMENTATION', { IMPLEMENTATION_retries: 5 });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c4', { taskId });
      const d = result.details as { advanced: boolean; escalated: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.escalated).toBe(true);
      expect(d.reason).toContain('exceeded max retries');
    });

    it('skips DESIGN when skipDesign=true', async () => {
      const taskId = await createPipelineTask('DECOMPOSITION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c5', { taskId, skipDesign: true });
      const d = result.details as { advanced: boolean; previousStage: string; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.previousStage).toBe('DECOMPOSITION');
      expect(d.currentStage).toBe('IMPLEMENTATION'); // skipped DESIGN

      // Check metadata records skip reason
      const task = deps.taskRepo.getById(taskId)!;
      const meta = task.metadata as Record<string, unknown>;
      expect(meta.DESIGN_skipped).toBe(true);
      expect(meta.DESIGN_skipReason).toBe('Explicitly skipped by caller');
    });

    it('auto-skips DESIGN for non-UI tasks when configured', async () => {
      deps.orchestratorConfig = { skipDesignForNonUITasks: true };
      const taskId = await createPipelineTask('DECOMPOSITION', { taskType: 'backend' });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c6', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('IMPLEMENTATION');

      const task = deps.taskRepo.getById(taskId)!;
      const meta = task.metadata as Record<string, unknown>;
      expect(meta.DESIGN_skipReason).toBe('Auto-skipped: non-UI task (skipDesignForNonUITasks=true)');
    });

    it('does not skip DESIGN for UI tasks even when skipDesignForNonUITasks=true', async () => {
      deps.orchestratorConfig = { skipDesignForNonUITasks: true };
      const taskId = await createPipelineTask('DECOMPOSITION', { taskType: 'frontend' });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c7', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('DESIGN'); // not skipped
    });

    it('records stage duration in metadata', async () => {
      const startTime = '2026-03-01T11:00:00.000Z';
      const taskId = await createPipelineTask('IMPLEMENTATION', { IMPLEMENTATION_startedAt: startTime });
      const tool = pipelineAdvanceToolDef(deps);
      await tool.execute('c8', { taskId });

      const task = deps.taskRepo.getById(taskId)!;
      const meta = task.metadata as Record<string, unknown>;
      expect(meta.IMPLEMENTATION_completedAt).toBe(NOW);
      expect(typeof meta.IMPLEMENTATION_durationMs).toBe('number');
    });

    it('includes nextAction spawn directive when not at DONE', async () => {
      const taskId = await createPipelineTask('QA');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c9', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string; nextAction?: { action: string; agentId: string } };

      expect(d.currentStage).toBe('REVIEW');
      expect(d.nextAction).toBeDefined();
      expect(d.nextAction!.action).toBe('spawn_subagent');
      expect(d.nextAction!.agentId).toBe('tech-lead');
    });

    it('does not include nextAction when advancing to DONE', async () => {
      const taskId = await createPipelineTask('SHIPPING');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c10', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string; nextAction?: unknown };

      expect(d.currentStage).toBe('DONE');
      expect(d.nextAction).toBeUndefined();
    });

    it('allows current stage owner to advance', async () => {
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c11', { taskId, _callerAgentId: 'back-1' });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('allows pm to advance any stage', async () => {
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c12', { taskId, _callerAgentId: 'pm' });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('allows tech-lead to advance any stage', async () => {
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c13', { taskId, _callerAgentId: 'tech-lead' });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('rejects unauthorized caller', async () => {
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c14', { taskId, _callerAgentId: 'designer' });
      const d = result.details as { advanced: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.reason).toContain('designer');
      expect(d.reason).toContain('not authorized');
    });

    it('skips caller validation when _callerAgentId is not present', async () => {
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('c15', { taskId });
      const d = result.details as { advanced: boolean };

      // No _callerAgentId means no validation — backwards compatible
      expect(d.advanced).toBe(true);
    });

    it('includes task title in spawn message', async () => {
      const taskId = await createPipelineTask('REFINEMENT');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sm1', { taskId });
      const d = result.details as { advanced: boolean; nextAction?: { task: string } };

      expect(d.advanced).toBe(true);
      expect(d.nextAction?.task).toContain('Test pipeline advance');
    });

    it('includes stage-specific instructions in spawn message', async () => {
      const taskId = await createPipelineTask('REFINEMENT');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sm2', { taskId });
      const d = result.details as { nextAction?: { task: string } };

      // REFINEMENT -> DECOMPOSITION: should contain architecture/subtasks instruction
      expect(d.nextAction?.task).toContain('Break requirements into technical subtasks');
    });

    it('includes explicit pipeline_advance call in spawn message', async () => {
      const taskId = await createPipelineTask('DESIGN');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sm3', { taskId });
      const d = result.details as { nextAction?: { task: string } };

      expect(d.nextAction?.task).toContain(`pipeline_advance({ taskId: "${taskId}" })`);
      expect(d.nextAction?.task).toContain('Do NOT wait for instructions');
    });
  });

  describe('buildStageSpawnMessage', () => {
    it('includes task title and stage instructions', () => {
      const msg = buildStageSpawnMessage('task-1', 'IMPLEMENTATION', 'My Feature', { ideaText: 'Build a landing page' });
      expect(msg).toContain('My Feature');
      expect(msg).toContain('Implement the solution');
      expect(msg).toContain('Build a landing page');
      expect(msg).toContain('pipeline_advance({ taskId: "task-1" })');
    });

    it('handles missing ideaText gracefully', () => {
      const msg = buildStageSpawnMessage('task-2', 'QA', 'Test Task', {});
      expect(msg).toContain('Test Task');
      expect(msg).toContain('Run test suites');
      expect(msg).not.toContain('Idea:');
    });
  });

  describe('pipeline.metrics', () => {
    it('returns empty stages when no pipeline tasks exist', async () => {
      const tool = pipelineMetricsToolDef(deps);
      const result = await tool.execute('m1', {});
      const d = result.details as { stages: unknown[]; taskCount: number };

      expect(d.stages).toHaveLength(0);
      expect(d.taskCount).toBe(0);
    });

    it('aggregates stage metrics from pipeline task metadata', async () => {
      const taskId = await createPipelineTask('QA', {
        IDEA_durationMs: 5000,
        IDEA_retries: 0,
        ROADMAP_durationMs: 10000,
        ROADMAP_retries: 1,
      });

      const tool = pipelineMetricsToolDef(deps);
      const result = await tool.execute('m2', { taskId });
      const d = result.details as { stages: Array<{ stage: string; taskCount: number; avgDurationMs: number; totalRetries: number }>; taskCount: number };

      expect(d.taskCount).toBe(1);
      const ideaStage = d.stages.find(s => s.stage === 'IDEA');
      expect(ideaStage).toBeDefined();
      expect(ideaStage!.avgDurationMs).toBe(5000);

      const roadmapStage = d.stages.find(s => s.stage === 'ROADMAP');
      expect(roadmapStage).toBeDefined();
      expect(roadmapStage!.totalRetries).toBe(1);
    });

    it('returns metrics for all pipeline tasks when taskId is omitted', async () => {
      await createPipelineTask('IMPLEMENTATION', { IDEA_durationMs: 3000 });
      await createPipelineTask('QA', { IDEA_durationMs: 7000 });

      const tool = pipelineMetricsToolDef(deps);
      const result = await tool.execute('m3', {});
      const d = result.details as { stages: Array<{ stage: string; avgDurationMs: number }>; taskCount: number };

      expect(d.taskCount).toBeGreaterThanOrEqual(2);
      const ideaStage = d.stages.find(s => s.stage === 'IDEA');
      expect(ideaStage).toBeDefined();
      expect(ideaStage!.avgDurationMs).toBe(5000); // (3000 + 7000) / 2
    });
  });
});
