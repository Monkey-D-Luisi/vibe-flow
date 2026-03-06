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
import { pipelineTimelineToolDef } from '../../src/tools/pipeline-advance.js';
import { pipelineStartToolDef } from '../../src/tools/pipeline.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-03-01T12:00:00.000Z';

describe('pipeline.timeline', () => {
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
    const generateId = () => `01TL_${String(++idCounter).padStart(10, '0')}`;
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

  async function createPipelineTask(stage: string, extraMeta?: Record<string, unknown>): Promise<string> {
    const startTool = pipelineStartToolDef(deps);
    const result = await startTool.execute('setup', { ideaText: 'Test timeline' });
    const details = result.details as { taskId: string };
    const taskId = details.taskId;

    const task = deps.taskRepo.getById(taskId)!;
    const meta = {
      ...(task.metadata as Record<string, unknown>),
      pipelineStage: stage,
      [`${stage}_startedAt`]: NOW,
      ...extraMeta,
    };
    deps.taskRepo.update(taskId, { metadata: meta }, task.rev, NOW);

    return taskId;
  }

  it('returns error for non-existent task', async () => {
    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId: 'nonexistent' });
    const d = result.details as { error: string };
    expect(d.error).toBe('Task not found');
  });

  it('returns timeline with active stage for new pipeline task', async () => {
    const taskId = await createPipelineTask('IDEA');
    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId });
    const d = result.details as {
      taskId: string;
      currentStage: string;
      stages: Array<{ stage: string; status: string; owner: string }>;
    };

    expect(d.taskId).toBe(taskId);
    expect(d.currentStage).toBe('IDEA');

    const ideaStage = d.stages.find(s => s.stage === 'IDEA');
    expect(ideaStage).toBeDefined();
    expect(ideaStage!.status).toBe('active');
    expect(ideaStage!.owner).toBe('pm');

    const roadmapStage = d.stages.find(s => s.stage === 'ROADMAP');
    expect(roadmapStage).toBeDefined();
    expect(roadmapStage!.status).toBe('pending');
  });

  it('shows completed stages with durations', async () => {
    const taskId = await createPipelineTask('ROADMAP', {
      IDEA_startedAt: '2026-03-01T11:50:00.000Z',
      IDEA_completedAt: '2026-03-01T11:50:10.000Z',
      IDEA_durationMs: 10000,
    });

    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId });
    const d = result.details as {
      stages: Array<{ stage: string; status: string; durationMs: number | null }>;
      totalDurationMs: number | null;
    };

    const ideaStage = d.stages.find(s => s.stage === 'IDEA');
    expect(ideaStage!.status).toBe('completed');
    expect(ideaStage!.durationMs).toBe(10000);
    expect(d.totalDurationMs).toBe(10000);
  });

  it('marks skipped stages correctly', async () => {
    const taskId = await createPipelineTask('IMPLEMENTATION', {
      DESIGN_skipped: true,
      DESIGN_skipReason: 'Non-UI task',
    });

    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId });
    const d = result.details as {
      stages: Array<{ stage: string; status: string }>;
    };

    const designStage = d.stages.find(s => s.stage === 'DESIGN');
    expect(designStage!.status).toBe('skipped');
  });

  it('includes all 10 pipeline stages in order', async () => {
    const taskId = await createPipelineTask('IDEA');
    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId });
    const d = result.details as {
      stages: Array<{ stage: string }>;
    };

    expect(d.stages).toHaveLength(10);
    expect(d.stages[0]!.stage).toBe('IDEA');
    expect(d.stages[9]!.stage).toBe('DONE');
  });

  it('returns null totalDurationMs when no durations recorded', async () => {
    const taskId = await createPipelineTask('IDEA');
    const tool = pipelineTimelineToolDef(deps);
    const result = await tool.execute('c1', { taskId });
    const d = result.details as { totalDurationMs: number | null };

    expect(d.totalDurationMs).toBeNull();
  });
});
