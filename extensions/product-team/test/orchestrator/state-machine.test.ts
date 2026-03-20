import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { transition, type TransitionDeps } from '../../src/orchestrator/state-machine.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import {
  TaskNotFoundError,
  InvalidTransitionError,
  LeaseConflictError,
  TransitionGuardError,
} from '../../src/domain/errors.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01SM_TEST_0000001';

interface WorkflowMetadataOptions {
  adrId?: string;
  contracts?: Array<Record<string, unknown>>;
  coverage?: number;
  lintClean?: boolean;
  refactorLog?: Array<Record<string, unknown>>;
  reviewViolations?: Array<Record<string, unknown>>;
  qaFailed?: number;
}

function createWorkflowMetadata(options: WorkflowMetadataOptions = {}): Record<string, unknown> {
  return {
    architecture_plan: {
      modules: [{ name: 'api', responsibility: 'Handle requests', dependencies: [] }],
      contracts: options.contracts ?? [
        { name: 'task.create', schema: '{ title: string }', direction: 'in' as const },
        { name: 'task.update', schema: '{ id: string }', direction: 'in' as const },
      ],
      patterns: ['hexagonal'],
      test_plan: [
        { scenario: 'Unit tests', type: 'unit' as const, priority: 'high' as const },
        { scenario: 'Integration tests', type: 'integration' as const, priority: 'medium' as const },
      ],
      adr_id: options.adrId ?? 'ADR-001',
    },
    dev_result: {
      diff_summary: 'Implemented feature',
      metrics: {
        coverage: options.coverage ?? 92,
        lint_clean: options.lintClean ?? true,
      },
      red_green_refactor_log: options.refactorLog ?? [
        { phase: 'red', description: 'Write failing test', files_changed: ['src/test.ts'] },
        { phase: 'green', description: 'Implement feature', files_changed: ['src/index.ts'] },
      ],
    },
    review_result: {
      violations: options.reviewViolations ?? [],
      overall_verdict: 'approve',
    },
    qa_report: {
      total: 12,
      passed: 12,
      failed: options.qaFailed ?? 0,
      skipped: 0,
      evidence: [{ criterion: 'Feature works', status: 'pass', test_names: ['qa-report.test.ts'] }],
    },
  };
}

describe('state-machine transition', () => {
  let db: Database.Database;
  let taskRepo: SqliteTaskRepository;
  let orchestratorRepo: SqliteOrchestratorRepository;
  let deps: TransitionDeps;
  let currentTime: string;

  beforeEach(() => {
    db = createTestDatabase();
    taskRepo = new SqliteTaskRepository(db);
    orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);

    currentTime = NOW;
    let idCounter = 0;
    const generateId = () => `01EVT_SM_${String(++idCounter).padStart(7, '0')}`;

    const eventLog = new EventLog(eventRepo, generateId, () => currentTime);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      now: () => currentTime,
      guardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
    };

    const task = createTaskRecord(
      {
        title: 'Test task',
        scope: 'major',
        metadata: createWorkflowMetadata(),
      },
      TASK_ID,
      NOW,
    );
    const orchState = createOrchestratorState(TASK_ID, NOW);
    taskRepo.create(task, orchState);
  });

  afterEach(() => {
    db?.close();
  });

  describe('valid transitions', () => {
    it('should transition backlog -> grooming', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);

      expect(result.task.status).toBe('grooming');
      expect(result.orchestratorState.current).toBe('grooming');
      expect(result.orchestratorState.previous).toBe('backlog');
      expect(result.orchestratorState.lastAgent).toBe('pm');
      expect(result.event.eventType).toBe('task.transition');
      expect(result.fastTrack).toBe(false);
    });

    it('should transition through full lifecycle', () => {
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');

      result = transition(TASK_ID, 'design', 'tech-lead', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('design');

      result = transition(TASK_ID, 'in_progress', 'back-1', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('in_progress');

      result = transition(TASK_ID, 'in_review', 'back-1', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('in_review');

      result = transition(TASK_ID, 'qa', 'tech-lead', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('qa');

      result = transition(TASK_ID, 'done', 'qa', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('done');
    });

    it('should auto-fast-track minor tasks from grooming to in_progress', () => {
      const minorTaskId = '01SM_MINOR_000001';
      const minorTask = createTaskRecord(
        {
          title: 'Minor task',
          scope: 'minor',
          metadata: createWorkflowMetadata(),
        },
        minorTaskId,
        NOW,
      );
      taskRepo.create(minorTask, createOrchestratorState(minorTaskId, NOW));

      const grooming = transition(minorTaskId, 'grooming', 'pm', 0, deps);
      const result = transition(
        minorTaskId,
        'design',
        'tech-lead',
        grooming.orchestratorState.rev,
        deps,
      );

      expect(result.task.status).toBe('in_progress');
      expect(result.effectiveToStatus).toBe('in_progress');
      expect(result.fastTrack).toBe(true);

      const history = deps.eventLog.getHistory(minorTaskId);
      const fastTrackEvent = history.find((event) => event.eventType === 'task.fast_track');
      expect(fastTrackEvent).toBeDefined();
      expect(fastTrackEvent?.payload).toEqual({
        requestedTo: 'design',
        effectiveTo: 'in_progress',
      });
    });
  });

  describe('invalid transitions', () => {
    it('should reject invalid transition with InvalidTransitionError', () => {
      expect(() =>
        transition(TASK_ID, 'done', 'pm', 0, deps),
      ).toThrow(InvalidTransitionError);
    });

    it('should throw TaskNotFoundError for non-existent task', () => {
      expect(() =>
        transition('NONEXISTENT', 'grooming', 'pm', 0, deps),
      ).toThrow(TaskNotFoundError);
    });
  });

  describe('transition guards', () => {
    it('should block design -> in_progress when architecture evidence is incomplete', () => {
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      result = transition(TASK_ID, 'design', 'tech-lead', result.orchestratorState.rev, deps);

      const currentTask = taskRepo.getById(TASK_ID);
      expect(currentTask).not.toBeNull();
      taskRepo.update(
        TASK_ID,
        {
          metadata: createWorkflowMetadata({
            adrId: '',
            contracts: [],
          }),
        },
        currentTask!.rev,
        NOW,
      );

      expect(() =>
        transition(TASK_ID, 'in_progress', 'back-1', result.orchestratorState.rev, deps),
      ).toThrow(TransitionGuardError);
    });

    it('should apply scope coverage thresholds for in_progress -> in_review', () => {
      const minorTaskId = '01SM_MINOR_000002';
      const minorTask = createTaskRecord(
        {
          title: 'Minor task with low coverage',
          scope: 'minor',
          metadata: createWorkflowMetadata({
            coverage: 69,
          }),
        },
        minorTaskId,
        NOW,
      );
      taskRepo.create(minorTask, createOrchestratorState(minorTaskId, NOW));

      let result = transition(minorTaskId, 'grooming', 'pm', 0, deps);
      result = transition(
        minorTaskId,
        'in_progress',
        'dev',
        result.orchestratorState.rev,
        deps,
      );

      expect(() =>
        transition(minorTaskId, 'in_review', 'back-1', result.orchestratorState.rev, deps),
      ).toThrow(TransitionGuardError);
    });

    it('should block in_review -> qa when max review rounds is reached', () => {
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      result = transition(TASK_ID, 'design', 'tech-lead', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_progress', 'back-1', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_review', 'tech-lead', result.orchestratorState.rev, deps);

      const cappedState = orchestratorRepo.update(
        TASK_ID,
        { roundsReview: DEFAULT_TRANSITION_GUARD_CONFIG.maxReviewRounds },
        result.orchestratorState.rev,
        NOW,
      );

      expect(() =>
        transition(TASK_ID, 'qa', 'tech-lead', cappedState.rev, deps),
      ).toThrow(TransitionGuardError);
    });
  });

  describe('event logging', () => {
    it('should log transition event with from/to in payload', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);

      expect(result.event.eventType).toBe('task.transition');
      expect(result.event.payload).toEqual({
        from: 'backlog',
        to: 'grooming',
      });
      expect(result.event.agentId).toBe('pm');
    });
  });

  describe('optimistic locking', () => {
    it('should reject stale orchestrator rev', () => {
      transition(TASK_ID, 'grooming', 'pm', 0, deps);

      expect(() =>
        transition(TASK_ID, 'design', 'tech-lead', 0, deps),
      ).toThrow(/[Ss]tale/);
    });
  });

  describe('review rejection counter', () => {
    it('should increment roundsReview on in_review -> in_progress', () => {
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      result = transition(TASK_ID, 'design', 'tech-lead', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_progress', 'back-1', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_review', 'tech-lead', result.orchestratorState.rev, deps);

      expect(result.orchestratorState.roundsReview).toBe(0);

      result = transition(TASK_ID, 'in_progress', 'tech-lead', result.orchestratorState.rev, deps);
      expect(result.orchestratorState.roundsReview).toBe(1);
    });
  });

  describe('lease enforcement', () => {
    it('should reject transition when lease held by different agent', () => {
      deps.leaseRepo.acquire(TASK_ID, 'pm', NOW, '2026-02-24T12:05:00.000Z');

      expect(() =>
        transition(TASK_ID, 'grooming', 'back-1', 0, deps),
      ).toThrow(LeaseConflictError);
    });

    it('should allow transition by lease holder', () => {
      deps.leaseRepo.acquire(TASK_ID, 'pm', NOW, '2026-02-24T12:05:00.000Z');

      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');
    });

    it('should allow transition when no lease exists', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');
    });
  });
});
