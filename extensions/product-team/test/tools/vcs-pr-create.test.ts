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
import { GhCommandError, type GhClient } from '../../src/github/gh-client.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';
import { vcsPrCreateToolDef } from '../../src/tools/vcs-pr-create.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('vcs.pr.create tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;
  let ghClient: GhClient;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    taskRepo.create(
      createTaskRecord(
        {
          title: 'Task one',
          metadata: {
            acceptance_criteria: ['should pass tests', 'should update docs'],
          },
        },
        'TASK-1',
        NOW,
      ),
      createOrchestratorState('TASK-1', NOW),
    );

    ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(async () => ({
        ref: 'refs/heads/task/TASK-1-feature',
        sha: 'new-sha',
      })),
      createPr: vi.fn(async () => ({
        number: 11,
        url: 'https://example/pr/11',
        title: 'Feature PR',
      })),
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

    // Pre-seed a branch so vcs.pr.create can resolve head branch.
    requestRepo.insert({
      requestId: 'REQ-SEED-BRANCH',
      taskId: 'TASK-1',
      tool: 'vcs.branch.create',
      payloadHash: 'seed-branch-hash',
      response: '{"branch":"task/TASK-1-feature","base":"main","sha":"new-sha","created":true,"cached":false}',
      createdAt: NOW,
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

  it('should create a PR and auto-generate body from task metadata', async () => {
    const tool = vcsPrCreateToolDef(deps);
    const result = await tool.execute('call-1', {
      taskId: 'TASK-1',
      title: 'Feature PR',
      labels: ['infra'],
    });

    const details = result.details as { number: number; bodyGenerated: boolean };
    expect(details.number).toBe(11);
    expect(details.bodyGenerated).toBe(true);
    expect(ghClient.createPr).toHaveBeenCalledTimes(1);

    const createCall = (ghClient.createPr as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      body: string;
    };
    expect(createCall.body).toContain('## Summary');
    expect(createCall.body).toContain('Acceptance criteria');
  });

  it('should return cached result for duplicate requests', async () => {
    const tool = vcsPrCreateToolDef(deps);
    await tool.execute('call-1', {
      taskId: 'TASK-1',
      title: 'Feature PR',
      labels: ['infra'],
    });

    const second = await tool.execute('call-2', {
      taskId: 'TASK-1',
      title: 'Feature PR',
      labels: ['infra'],
    });

    const details = second.details as { cached: boolean };
    expect(details.cached).toBe(true);
    expect(ghClient.createPr).toHaveBeenCalledTimes(1);
  });

  it('should return structured tool error when gh fails', async () => {
    ghClient.createPr = vi.fn(async () => {
      throw new GhCommandError('GitHub command failed with exit code 1', {
        code: 'GH_COMMAND_FAILED',
        command: 'gh pr create',
        exitCode: 1,
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    });

    const tool = vcsPrCreateToolDef(deps);
    await expect(
      tool.execute('call-1', {
        taskId: 'TASK-1',
        title: 'Feature PR',
      }),
    ).rejects.toThrow(/GH_COMMAND_FAILED/);
  });
});
