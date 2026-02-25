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
import { qualityTestsToolDef } from '../../src/tools/quality-tests.js';

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
  const generateId = () => `01QTEST_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.tests tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Quality test task' });
    taskId = (created.details as { task: { id: string } }).task.id;
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  it('stores qa_report and quality.tests metadata from vitest output', async () => {
    vi.mocked(safeSpawn).mockResolvedValue({
      stdout: JSON.stringify({
        success: true,
        testResults: [
          {
            filepath: '/test/a.test.ts',
            status: 'passed',
            duration: 5,
            assertionResults: [
              { fullName: 'a', status: 'passed', duration: 2 },
              { fullName: 'b', status: 'passed', duration: 3 },
            ],
          },
        ],
      }),
      stderr: '',
      exitCode: 0,
      durationMs: 20,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });

    const tool = qualityTestsToolDef(deps);
    const result = await tool.execute('q1', {
      taskId,
      agentId: 'qa',
      rev: 0,
    });

    const details = result.details as { task: { metadata: Record<string, unknown> } };
    const metadata = details.task.metadata;
    const qaReport = metadata.qa_report as Record<string, unknown>;
    expect(qaReport.total).toBe(2);
    expect(qaReport.failed).toBe(0);
    expect((metadata.quality as Record<string, unknown>).tests).toBeDefined();

    const events = deps.eventLog.getHistory(taskId).filter((event) => event.eventType === 'quality.tests');
    expect(events).toHaveLength(1);
    expect(events[0].payload.correlationId).toBeTypeOf('string');
  });
});
