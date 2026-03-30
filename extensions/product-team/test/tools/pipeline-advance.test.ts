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
      orchestratorConfig: { stageQualityEnabled: false, selfEvaluationEnabled: false },
    };
  });

  afterEach(() => {
    db?.close();
  });

  /** Helper: create a pipeline task at a given stage */
  async function createPipelineTask(stage: string, extraMeta?: Record<string, unknown>): Promise<string> {
    const startTool = pipelineStartToolDef(deps);
    const uniqueIdea = `Test pipeline advance ${++idCounter}`;
    const result = await startTool.execute('setup', { ideaText: uniqueIdea });
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
      deps.orchestratorConfig = { maxRetriesPerStage: 1, stageQualityEnabled: false, selfEvaluationEnabled: false };
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
      deps.orchestratorConfig = { skipDesignForNonUITasks: true, selfEvaluationEnabled: false };
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
      deps.orchestratorConfig = { skipDesignForNonUITasks: true, selfEvaluationEnabled: false };
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

      expect(d.nextAction?.task).toContain(`pipeline_advance({ taskId: "${taskId}", selfEvaluation:`);
      expect(d.nextAction?.task).toContain('Do NOT wait for instructions');
    });
  });

  describe('buildStageSpawnMessage', () => {
    it('includes task title and stage instructions', () => {
      const msg = buildStageSpawnMessage('task-1', 'IMPLEMENTATION', 'My Feature', { ideaText: 'Build a landing page' });
      expect(msg).toContain('My Feature');
      expect(msg).toContain('Implement the solution');
      expect(msg).toContain('Build a landing page');
      expect(msg).toContain('pipeline_advance({ taskId: "task-1", selfEvaluation:');
    });

    it('handles missing ideaText gracefully', () => {
      const msg = buildStageSpawnMessage('task-2', 'QA', 'Test Task', {});
      expect(msg).toContain('Test Task');
      expect(msg).toContain('Run test suites');
      expect(msg).not.toContain('Idea:');
    });

    // EP21 Task 0146: Review loop context enrichment
    it('includes repair brief when returning to IMPLEMENTATION with review violations', () => {
      const violations = [
        { severity: 'high', message: 'Missing auth check', file: 'src/api.ts' },
        { severity: 'medium', message: 'Magic number' },
      ];
      const msg = buildStageSpawnMessage('task-1', 'IMPLEMENTATION', 'Auth Feature', {
        review_result: { violations },
        reviewHistory: [{
          round: 1,
          violations,
          timestamp: '2026-03-01T12:00:00.000Z',
        }],
      });
      expect(msg).toContain('Repair Brief');
      expect(msg).toContain('Missing auth check');
      expect(msg).toContain('src/api.ts');
    });

    it('does not include repair brief for non-IMPLEMENTATION stages', () => {
      const msg = buildStageSpawnMessage('task-1', 'QA', 'Auth Feature', {
        review_result: {
          violations: [{ severity: 'high', message: 'test' }],
        },
      });
      expect(msg).not.toContain('Repair Brief');
    });

    it('shows escalation message when review loop is exhausted', () => {
      const violations = [{ severity: 'high', message: 'Persistent issue' }];
      const msg = buildStageSpawnMessage('task-1', 'IMPLEMENTATION', 'Auth Feature', {
        review_result: { violations },
        reviewHistory: [
          { round: 1, violations, timestamp: '2026-01-01T00:00:00.000Z' },
          { round: 2, violations, timestamp: '2026-01-02T00:00:00.000Z' },
          { round: 3, violations, timestamp: '2026-01-03T00:00:00.000Z' },
        ],
        maxReviewRounds: 3,
      });
      expect(msg).toContain('Escalation Required');
    });

    it('does not include repair brief when no violations', () => {
      const msg = buildStageSpawnMessage('task-1', 'IMPLEMENTATION', 'Auth Feature', {
        review_result: { violations: [] },
      });
      expect(msg).not.toContain('Repair Brief');
      expect(msg).not.toContain('Escalation');
    });
  });

  describe('REVIEW → IMPLEMENTATION backward transition (CR-0277)', () => {
    it('redirects to IMPLEMENTATION when blocking violations exist', async () => {
      const taskId = await createPipelineTask('REVIEW', {
        review_result: {
          violations: [
            { severity: 'high', message: 'Missing error handling', file: 'src/api.ts' },
          ],
        },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('rev-1', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string; owner: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('IMPLEMENTATION');
      expect(d.owner).toBe('back-1');

      // Verify metadata was updated
      const task = deps.taskRepo.getById(taskId)!;
      const meta = task.metadata as Record<string, unknown>;
      expect(meta['pipelineStage']).toBe('IMPLEMENTATION');
      expect(meta['pipelineOwner']).toBe('back-1');
      expect(Array.isArray(meta['reviewHistory'])).toBe(true);
    });

    it('advances to SHIPPING when no blocking violations', async () => {
      const taskId = await createPipelineTask('REVIEW', {
        review_result: {
          violations: [
            { severity: 'low', message: 'Minor style issue' },
          ],
        },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('rev-2', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('SHIPPING');
    });

    it('advances to SHIPPING when review rounds exhausted', async () => {
      const violations = [{ severity: 'high', message: 'Persistent issue' }];
      const taskId = await createPipelineTask('REVIEW', {
        review_result: { violations },
        reviewHistory: [
          { round: 1, violations, timestamp: '2026-01-01T00:00:00.000Z' },
          { round: 2, violations, timestamp: '2026-01-02T00:00:00.000Z' },
        ],
      });
      // maxReviewRounds defaults to 3, roundNumber will be 3 (= maxReviewRounds), so no redirect
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('rev-3', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('SHIPPING');
    });

    it('emits review_loop_back event on backward transition', async () => {
      const taskId = await createPipelineTask('REVIEW', {
        review_result: {
          violations: [{ severity: 'critical', message: 'Security flaw' }],
        },
      });
      const tool = pipelineAdvanceToolDef(deps);
      await tool.execute('rev-4', { taskId });

      const events = db.prepare(
        "SELECT * FROM event_log WHERE task_id = ? AND event_type = 'pipeline.stage.review_loop_back'",
      ).all(taskId) as { payload: string }[];
      expect(events).toHaveLength(1);
      const payload = JSON.parse(events[0].payload);
      expect(payload.round).toBe(1);
      expect(payload.blockingViolations).toBe(1);
    });

    it('includes repair brief in spawn message on backward transition', async () => {
      const taskId = await createPipelineTask('REVIEW', {
        review_result: {
          violations: [
            { severity: 'high', message: 'Missing auth check', file: 'src/handler.ts' },
          ],
        },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('rev-5', { taskId });
      const d = result.details as { nextAction?: { task: string } };

      expect(d.nextAction).toBeDefined();
      expect(d.nextAction!.task).toContain('Repair Brief');
      expect(d.nextAction!.task).toContain('Missing auth check');
    });
  });

  describe('SHIPPING → DONE CI gate', () => {
    it('blocks SHIPPING-to-DONE when shipping_result is missing', async () => {
      const taskId = await createPipelineTask('SHIPPING');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('ship-1', { taskId });
      const d = result.details as { advanced: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.reason).toContain('Missing shipping_result.ci_status');

      // Verify blocked event was emitted
      const events = db.prepare(
        "SELECT * FROM event_log WHERE task_id = ? AND event_type = 'pipeline.stage.blocked'",
      ).all(taskId) as { payload: string }[];
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0].payload)).toMatchObject({ stage: 'SHIPPING' });
    });

    it('blocks SHIPPING-to-DONE when ci_status is failure', async () => {
      const taskId = await createPipelineTask('SHIPPING', {
        shipping_result: { ci_status: 'failure', pr_url: 'https://github.com/test/pr/1' },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('ship-2', { taskId });
      const d = result.details as { advanced: boolean; reason: string };

      expect(d.advanced).toBe(false);
      expect(d.reason).toContain('CI status is "failure"');

      // Verify blocked event was emitted
      const events = db.prepare(
        "SELECT * FROM event_log WHERE task_id = ? AND event_type = 'pipeline.stage.blocked'",
      ).all(taskId) as { payload: string }[];
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0].payload)).toMatchObject({ stage: 'SHIPPING' });
    });

    it('allows SHIPPING-to-DONE when ci_status is success', async () => {
      const taskId = await createPipelineTask('SHIPPING', {
        shipping_result: { ci_status: 'success', pr_url: 'https://github.com/test/pr/1' },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('ship-3', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string; nextAction?: unknown };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('DONE');
      expect(d.nextAction).toBeUndefined();
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

  describe('stage quality validation (EP21, Task 0141)', () => {
    it('blocks IMPLEMENTATION advance when dev_result is missing', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: true, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sq1', { taskId });
      const d = result.details as { advanced: boolean; qualityFailures: unknown[] };

      expect(d.advanced).toBe(false);
      expect(d.qualityFailures).toBeDefined();
      expect(d.qualityFailures.length).toBeGreaterThan(0);
    });

    it('allows IMPLEMENTATION advance when quality metrics are valid', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: true, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, coverage: 85, lint_clean: true },
        },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sq2', { taskId });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('QA');
    });

    it('blocks QA advance when qa_report has failures', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: true, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('QA', {
        qa_report: { failed: 2, total: 50 },
      });
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sq3', { taskId });
      const d = result.details as { advanced: boolean; qualityFailures: unknown[] };

      expect(d.advanced).toBe(false);
      expect(d.qualityFailures.length).toBeGreaterThan(0);
    });

    it('allows non-gated stages to advance without quality metadata', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: true, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IDEA');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sq4', { taskId });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('emits quality_blocked event when quality fails', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: true, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      await tool.execute('sq5', { taskId });

      const events = db.prepare(
        "SELECT * FROM event_log WHERE task_id = ? AND event_type = 'pipeline.stage.quality_blocked'",
      ).all(taskId) as { payload: string }[];
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0].payload)).toMatchObject({ stage: 'IMPLEMENTATION' });
    });

    it('respects stageQualityEnabled=false', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('sq6', { taskId });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });
  });

  describe('self-evaluation enforcement (EP21, Task 0144)', () => {
    it('blocks IMPLEMENTATION advance without self-evaluation', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('se1', { taskId });
      const d = result.details as { advanced: boolean; evalFailures: unknown[] };

      expect(d.advanced).toBe(false);
      expect(d.evalFailures).toBeDefined();
      expect(d.evalFailures.length).toBeGreaterThan(0);
    });

    it('allows IMPLEMENTATION advance with structured self-evaluation', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('se2', {
        taskId,
        selfEvaluation: {
          confidence: 4,
          completeness: 4,
          risks: 'none',
          summary: 'All tests pass, coverage at 92%',
        },
      });
      const d = result.details as { advanced: boolean; currentStage: string };

      expect(d.advanced).toBe(true);
      expect(d.currentStage).toBe('QA');
    });

    it('allows IMPLEMENTATION advance with string self-evaluation', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('se3', {
        taskId,
        selfEvaluation: 'All tests pass, good coverage',
      });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('stores self-evaluation in task metadata', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      await tool.execute('se4', {
        taskId,
        selfEvaluation: {
          confidence: 5,
          completeness: 4,
          risks: 'minor edge case',
          summary: 'Implemented feature X',
        },
      });

      const task = deps.taskRepo.getById(taskId)!;
      const meta = task.metadata as Record<string, unknown>;
      const stored = meta['IMPLEMENTATION_selfEvaluation'] as Record<string, unknown>;
      expect(stored).toBeDefined();
      expect(stored.confidence).toBe(5);
      expect(stored.summary).toBe('Implemented feature X');
    });

    it('allows non-evaluated stages without self-evaluation', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('IDEA');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('se5', { taskId });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('respects selfEvaluationEnabled=false', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: false };
      const taskId = await createPipelineTask('IMPLEMENTATION');
      const tool = pipelineAdvanceToolDef(deps);
      const result = await tool.execute('se6', { taskId });
      const d = result.details as { advanced: boolean };

      expect(d.advanced).toBe(true);
    });

    it('emits eval_blocked event on failure', async () => {
      deps.orchestratorConfig = { stageQualityEnabled: false, selfEvaluationEnabled: true };
      const taskId = await createPipelineTask('QA');
      const tool = pipelineAdvanceToolDef(deps);
      await tool.execute('se7', { taskId });

      const events = db.prepare(
        "SELECT * FROM event_log WHERE task_id = ? AND event_type = 'pipeline.stage.eval_blocked'",
      ).all(taskId) as { payload: string }[];
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0].payload)).toMatchObject({ stage: 'QA' });
    });
  });
});
