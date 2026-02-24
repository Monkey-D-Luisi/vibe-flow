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
import { vcsPrUpdateToolDef } from '../../src/tools/vcs-pr-update.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('vcs.pr.update tool', () => {
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
      updatePr: vi.fn(async () => ({
        number: 22,
        url: 'https://example/pr/22',
        title: 'Updated',
        state: 'OPEN',
      })),
      syncLabel: vi.fn(),
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

  it('should update a PR', async () => {
    const tool = vcsPrUpdateToolDef(deps);
    const result = await tool.execute('call-1', {
      taskId: 'TASK-1',
      prNumber: 22,
      title: 'Updated',
      state: 'open',
    });

    const details = result.details as { number: number; title: string };
    expect(details.number).toBe(22);
    expect(details.title).toBe('Updated');
    expect(ghClient.updatePr).toHaveBeenCalledTimes(1);
  });

  it('should fail when no update fields are provided', async () => {
    const tool = vcsPrUpdateToolDef(deps);
    await expect(
      tool.execute('call-1', {
        taskId: 'TASK-1',
        prNumber: 22,
      }),
    ).rejects.toThrow(/requires at least one field/);
  });

  it('should fail for unknown task', async () => {
    const tool = vcsPrUpdateToolDef(deps);
    await expect(
      tool.execute('call-1', {
        taskId: 'UNKNOWN',
        prNumber: 22,
        title: 'Updated',
      }),
    ).rejects.toThrow(/Task not found/);
  });
});
