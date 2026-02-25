import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskRecord, createOrchestratorState } from '../../src/domain/task-record.js';
import type { GhClient } from '../../src/github/gh-client.js';
import {
  CiFeedbackAutomation,
  buildTaskIdCandidatesFromBranch,
  normalizeGithubCiEvent,
  type CiFeedbackConfig,
} from '../../src/github/ci-feedback.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { LeaseManager } from '../../src/orchestrator/lease-manager.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { createTestDatabase } from '../helpers.js';

describe('ci-feedback', () => {
  let counter = 0;
  let db: ReturnType<typeof createTestDatabase>;
  let taskRepo: SqliteTaskRepository;
  let orchestratorRepo: SqliteOrchestratorRepository;
  let requestRepo: SqliteRequestRepository;
  let eventRepo: SqliteEventRepository;
  let leaseRepo: SqliteLeaseRepository;
  let eventLog: EventLog;
  let leaseManager: LeaseManager;
  let ghClient: GhClient;
  let ghCommentPr: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  const now = () => new Date(Date.parse('2026-02-25T12:00:00.000Z') + counter++ * 1_000).toISOString();
  const generateId = () => `id-${counter++}`;

  beforeEach(() => {
    counter = 0;
    db = createTestDatabase();
    taskRepo = new SqliteTaskRepository(db);
    orchestratorRepo = new SqliteOrchestratorRepository(db);
    requestRepo = new SqliteRequestRepository(db);
    eventRepo = new SqliteEventRepository(db);
    leaseRepo = new SqliteLeaseRepository(db);
    eventLog = new EventLog(eventRepo, generateId, now);
    leaseManager = new LeaseManager(leaseRepo, eventLog, now);
    ghCommentPr = vi.fn(async () => undefined);
    ghClient = {
      commentPr: ghCommentPr,
    } as unknown as GhClient;
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
  });

  afterEach(() => {
    db.close();
  });

  function createAutomation(configOverrides?: Partial<CiFeedbackConfig>): CiFeedbackAutomation {
    const baseConfig: CiFeedbackConfig = {
      enabled: true,
      routePath: '/webhooks/github/ci',
      webhookSecret: 'test-secret',
      expectedRepository: 'acme/vibe-flow',
      commentOnPr: true,
      autoTransition: {
        enabled: false,
        toStatus: null,
        agentId: 'infra',
      },
    };

    const config: CiFeedbackConfig = {
      ...baseConfig,
      ...configOverrides,
      autoTransition: {
        ...baseConfig.autoTransition,
        ...(configOverrides?.autoTransition ?? {}),
      },
    };

    return new CiFeedbackAutomation({
      taskRepo,
      orchestratorRepo,
      leaseManager,
      requestRepo,
      eventLog,
      ghClient,
      generateId,
      now,
      transitionDeps: {
        db,
        taskRepo,
        orchestratorRepo,
        leaseRepo,
        eventLog,
        now,
        guardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      },
      logger,
      config,
    });
  }

  function seedTask(taskId: string, metadata: Record<string, unknown> = {}): void {
    const task = createTaskRecord(
      {
        title: `Task ${taskId}`,
        scope: 'major',
        metadata,
      },
      taskId,
      now(),
    );
    const orchestrator = createOrchestratorState(taskId, now());
    taskRepo.create(task, orchestrator);
    eventLog.logTaskCreated(taskId, null);
  }

  it('normalizes check_run completed payloads', () => {
    const result = normalizeGithubCiEvent('check_run', {
      action: 'completed',
      repository: { full_name: 'acme/vibe-flow' },
      check_run: {
        name: 'CI / test',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://ci.example/run/1',
        pull_requests: [{ number: 14 }],
        check_suite: { head_branch: 'task/TASK-100-fix' },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.eventName).toBe('check_run');
    expect(result?.branch).toBe('task/TASK-100-fix');
    expect(result?.prNumber).toBe(14);
    expect(result?.overallConclusion).toBe('success');
  });

  it('builds branch candidates for hyphenated task ids', () => {
    expect(buildTaskIdCandidatesFromBranch('task/TASK-100-fix-ci')).toEqual([
      'TASK-100-fix-ci',
      'TASK-100-fix',
      'TASK-100',
      'TASK',
    ]);
  });

  it('updates metadata, logs event, and comments PR for a valid webhook', async () => {
    seedTask('TASK-100');
    const automation = createAutomation();

    const result = await automation.handleGithubWebhook({
      eventName: 'check_run',
      deliveryId: 'delivery-1',
      payload: {
        action: 'completed',
        repository: { full_name: 'acme/vibe-flow' },
        check_run: {
          name: 'CI / lint',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/run/lint',
          pull_requests: [{ number: 44 }],
          check_suite: { head_branch: 'task/TASK-100-fix-lint' },
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        cached: false,
        taskId: 'TASK-100',
        commentPosted: true,
      }),
    );
    expect(ghCommentPr).toHaveBeenCalledWith(
      44,
      expect.stringContaining('## CI Status Update'),
    );

    const task = taskRepo.getById('TASK-100');
    expect(task).not.toBeNull();
    const ci = (task?.metadata.ci as Record<string, unknown> | undefined) ?? {};
    const checks = (ci.checks as Record<string, unknown> | undefined) ?? {};
    expect(ci.lastConclusion).toBe('success');
    expect(checks).toHaveProperty('CI / lint');

    const history = eventLog.getHistory('TASK-100');
    expect(history.some((event) => event.eventType === 'vcs.ci.feedback')).toBe(true);
  });

  it('deduplicates duplicate webhook deliveries', async () => {
    seedTask('TASK-100');
    const automation = createAutomation();
    const input = {
      eventName: 'check_run',
      deliveryId: 'delivery-dup',
      payload: {
        action: 'completed',
        repository: { full_name: 'acme/vibe-flow' },
        check_run: {
          name: 'CI / test',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/run/test',
          pull_requests: [{ number: 55 }],
          check_suite: { head_branch: 'task/TASK-100-fix-tests' },
        },
      },
    } as const;

    const first = await automation.handleGithubWebhook(input);
    const second = await automation.handleGithubWebhook(input);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(ghCommentPr).toHaveBeenCalledTimes(1);
  });

  it('rejects webhook events from unexpected repositories', async () => {
    seedTask('TASK-100');
    const automation = createAutomation();

    const result = await automation.handleGithubWebhook({
      eventName: 'check_run',
      deliveryId: 'delivery-repo-mismatch',
      payload: {
        action: 'completed',
        repository: { full_name: 'evil/repo' },
        check_run: {
          name: 'CI / test',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/run/blocked',
          pull_requests: [{ number: 61 }],
          check_suite: { head_branch: 'task/TASK-100-security' },
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        handled: false,
        cached: false,
        reason: 'repository-mismatch',
      }),
    );
    expect(taskRepo.getById('TASK-100')?.metadata).toEqual({});
    expect(eventLog.getHistory('TASK-100').every((event) => event.eventType !== 'vcs.ci.feedback')).toBe(true);
    expect(ghCommentPr).not.toHaveBeenCalled();
  });

  it('attempts auto-transition when enabled and CI is successful', async () => {
    seedTask('TASK-200', { review_result: { violations: [] } });
    const initialTask = taskRepo.getById('TASK-200');
    expect(initialTask).not.toBeNull();
    taskRepo.update(
      'TASK-200',
      {
        status: 'in_review',
        metadata: {
          ...((initialTask?.metadata as Record<string, unknown>) ?? {}),
          review_result: { violations: [] },
        },
      },
      initialTask!.rev,
      now(),
    );

    const orchestrator = orchestratorRepo.getByTaskId('TASK-200');
    expect(orchestrator).not.toBeNull();
    orchestratorRepo.update(
      'TASK-200',
      {
        current: 'in_review',
        previous: 'in_progress',
      },
      orchestrator!.rev,
      now(),
    );

    const automation = createAutomation({
      autoTransition: {
        enabled: true,
        toStatus: 'qa',
        agentId: 'infra',
      },
    });

    const result = await automation.handleGithubWebhook({
      eventName: 'workflow_run',
      deliveryId: 'delivery-auto-transition',
      payload: {
        action: 'completed',
        repository: { full_name: 'acme/vibe-flow' },
        workflow_run: {
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/workflows/1',
          pull_requests: [{ number: 88 }],
          head_branch: 'task/TASK-200-ci-feedback',
        },
      },
    });

    expect(result.transition).toEqual(
      expect.objectContaining({
        attempted: true,
        transitioned: true,
        toStatus: 'qa',
      }),
    );
    expect(taskRepo.getById('TASK-200')?.status).toBe('qa');
  });
});
