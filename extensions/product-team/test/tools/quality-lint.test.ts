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
import { qualityLintToolDef } from '../../src/tools/quality-lint.js';

vi.mock('../../src/exec/spawn.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/exec/spawn.js')>('../../src/exec/spawn.js');
  return {
    ...actual,
    safeSpawn: vi.fn(),
  };
});

import { safeSpawn } from '../../src/exec/spawn.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QLINT_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.lint tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Lint task' });
    taskId = (created.details as { task: { id: string } }).task.id;
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it('stores lint metrics and lint_clean flag', async () => {
    vi.mocked(safeSpawn).mockResolvedValue({
      stdout: JSON.stringify([
        {
          filePath: '/src/a.ts',
          errorCount: 0,
          warningCount: 1,
          messages: [
            {
              ruleId: 'no-console',
              severity: 1,
              message: 'warn',
            },
          ],
        },
      ]),
      stderr: '',
      exitCode: 0,
      durationMs: 5,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });

    const tool = qualityLintToolDef(deps);
    const result = await tool.execute('lint-1', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'eslint',
    });

    const metadata = (result.details as { task: { metadata: Record<string, unknown> } }).task.metadata;
    const devResult = metadata.dev_result as Record<string, unknown>;
    const metrics = devResult.metrics as Record<string, unknown>;
    expect(metrics.lint_clean).toBe(true);

    const quality = metadata.quality as Record<string, unknown>;
    const lint = quality.lint as Record<string, unknown>;
    expect(lint.errors).toBe(0);
    expect(lint.warnings).toBe(1);

    const events = deps.eventLog.getHistory(taskId).filter((event) => event.eventType === 'quality.lint');
    expect(events).toHaveLength(1);
  });
});
