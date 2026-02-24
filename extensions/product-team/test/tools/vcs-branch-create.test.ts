import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { BranchService } from '../../src/github/branch-service.js';
import { PrService } from '../../src/github/pr-service.js';
import { LabelService } from '../../src/github/label-service.js';
import type { GhClient } from '../../src/github/gh-client.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';
import { vcsBranchCreateToolDef } from '../../src/tools/vcs-branch-create.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('vcs.branch.create tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskRepo: SqliteTaskRepository;
  let idCounter: number;
  let ghClient: GhClient;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    taskRepo = new SqliteTaskRepository(db);
    taskRepo.create(
      createTaskRecord({ title: 'Task one' }, 'TASK-1', NOW),
      createOrchestratorState('TASK-1', NOW),
    );

    ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(async () => ({
        ref: 'refs/heads/task/TASK-1-feature',
        sha: 'new-sha',
      })),
      createPr: vi.fn(),
      updatePr: vi.fn(),
      syncLabel: vi.fn(),
    } as unknown as GhClient;

    const requestRepo = new SqliteRequestRepository(db);
    const eventLog = new EventLog(
      new SqliteEventRepository(db),
      () => `EVT-${++idCounter}`,
      () => NOW,
    );

    const branchService = new BranchService({
      ghClient,
      requestRepo,
      eventLog,
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
      defaultBase: 'main',
    });
    const prService = new PrService({
      ghClient,
      requestRepo,
      eventLog,
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
      defaultBase: 'main',
    });
    const labelService = new LabelService({
      ghClient,
      requestRepo,
      eventLog,
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
    });

    deps = {
      db,
      taskRepo,
      orchestratorRepo: new SqliteOrchestratorRepository(db),
      leaseRepo: new SqliteLeaseRepository(db),
      eventLog,
      generateId: () => `ID-${++idCounter}`,
      now: () => NOW,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      vcs: {
        requestRepo,
        branchService,
        prService,
        labelService,
      },
    };
  });

  afterEach(() => {
    db?.close();
  });

  it('should create a task branch', async () => {
    const tool = vcsBranchCreateToolDef(deps);
    const result = await tool.execute('call-1', { taskId: 'TASK-1', slug: 'feature' });

    const details = result.details as { branch: string; sha: string; created: boolean };
    expect(details.branch).toBe('task/TASK-1-feature');
    expect(details.sha).toBe('new-sha');
    expect(details.created).toBe(true);
  });

  it('should return cached response on duplicate call', async () => {
    const tool = vcsBranchCreateToolDef(deps);
    await tool.execute('call-1', { taskId: 'TASK-1', slug: 'feature' });
    const second = await tool.execute('call-2', { taskId: 'TASK-1', slug: 'feature' });

    const details = second.details as { cached: boolean; created: boolean };
    expect(details.cached).toBe(true);
    expect(details.created).toBe(false);
    expect(ghClient.createBranch).toHaveBeenCalledTimes(1);
  });

  it('should fail for unknown task', async () => {
    const tool = vcsBranchCreateToolDef(deps);
    await expect(
      tool.execute('call-1', { taskId: 'UNKNOWN', slug: 'feature' }),
    ).rejects.toThrow(/Task not found/);
  });
});
