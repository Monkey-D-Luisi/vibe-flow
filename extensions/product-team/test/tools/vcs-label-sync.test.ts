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
import { vcsLabelSyncToolDef } from '../../src/tools/vcs-label-sync.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('vcs.label.sync tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;
  let ghClient: GhClient;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    taskRepo.create(
      createTaskRecord({ title: 'Task one' }, 'TASK-1', NOW),
      createOrchestratorState('TASK-1', NOW),
    );

    ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(),
      createPr: vi.fn(),
      updatePr: vi.fn(),
      syncLabel: vi.fn(async () => undefined),
    } as unknown as GhClient;

    const requestRepo = new SqliteRequestRepository(db);
    const eventLog = new EventLog(
      new SqliteEventRepository(db),
      () => `EVT-${++idCounter}`,
      () => NOW,
    );

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
        branchService: new BranchService({
          ghClient,
          requestRepo,
          eventLog,
          generateId: () => `REQ-${++idCounter}`,
          now: () => NOW,
          defaultBase: 'main',
        }),
        prService: new PrService({
          ghClient,
          requestRepo,
          eventLog,
          generateId: () => `REQ-${++idCounter}`,
          now: () => NOW,
          defaultBase: 'main',
        }),
        labelService: new LabelService({
          ghClient,
          requestRepo,
          eventLog,
          generateId: () => `REQ-${++idCounter}`,
          now: () => NOW,
        }),
      },
    };
  });

  afterEach(() => {
    db?.close();
  });

  it('should sync labels and return cached response on duplicate call', async () => {
    const tool = vcsLabelSyncToolDef(deps);
    const first = await tool.execute('call-1', {
      taskId: 'TASK-1',
      labels: [{ name: 'infra', color: 'abcdef', description: 'Infra work' }],
    });
    const second = await tool.execute('call-2', {
      taskId: 'TASK-1',
      labels: [{ name: 'infra', color: 'abcdef', description: 'Infra work' }],
    });

    const firstDetails = first.details as { synced: number; cached: boolean };
    const secondDetails = second.details as { cached: boolean };
    expect(firstDetails.synced).toBe(1);
    expect(firstDetails.cached).toBe(false);
    expect(secondDetails.cached).toBe(true);
    expect(ghClient.syncLabel).toHaveBeenCalledTimes(1);
  });

  it('should fail for unknown task', async () => {
    const tool = vcsLabelSyncToolDef(deps);
    await expect(
      tool.execute('call-1', {
        taskId: 'UNKNOWN',
        labels: [{ name: 'infra', color: 'abcdef' }],
      }),
    ).rejects.toThrow(/Task not found/);
  });
});
