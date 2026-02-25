import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';
import { qualityGateToolDef } from '../../src/tools/quality-gate.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QGATE_${String(++idCounter).padStart(10, '0')}`;
  const now = () => NOW;
  return {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog: new EventLog(eventRepo, generateId, now),
    generateId,
    now,
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    workspaceDir: process.cwd(),
  };
}

describe('quality.gate tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Gate task', scope: 'minor' });
    const task = (created.details as { task: { id: string; rev: number } }).task;
    taskId = task.id;

    deps.taskRepo.update(
      taskId,
      {
        metadata: {
          qa_report: {
            total: 10,
            passed: 10,
            failed: 0,
            skipped: 0,
            evidence: ['all green'],
          },
          dev_result: {
            metrics: {
              coverage: 90,
              lint_clean: true,
            },
            red_green_refactor_log: ['red', 'green'],
          },
          quality: {
            lint: {
              errors: 0,
              warnings: 0,
            },
          },
          complexity: {
            avg: 5,
            max: 10,
            files: 3,
          },
        },
      },
      task.rev,
      NOW,
    );
  });

  afterEach(() => {
    db.close();
  });

  it('evaluates gate and persists quality.gate result', async () => {
    const tool = qualityGateToolDef(deps);
    const result = await tool.execute('gate-1', {
      taskId,
      agentId: 'qa',
    });

    const details = result.details as {
      task: { metadata: Record<string, unknown> };
      output: { passed: boolean; violations: unknown[] };
    };
    expect(details.output.passed).toBe(true);
    expect(details.output.violations).toHaveLength(0);
    const quality = (details.task.metadata.quality as Record<string, unknown>);
    expect(quality.gate).toBeDefined();
  });
});
