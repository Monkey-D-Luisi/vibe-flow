import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
import { taskTransitionToolDef } from '../../src/tools/task-transition.js';
import { taskUpdateToolDef } from '../../src/tools/task-update.js';
import { qualityCoverageToolDef } from '../../src/tools/quality-coverage.js';
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
  const generateId = () => `01QPIP_${String(++idCounter).padStart(10, '0')}`;
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
  };
}

describe('quality pipeline integration', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let workingDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    workingDir = await mkdtemp(join(tmpdir(), 'quality-pipeline-'));
    await writeFile(
      join(workingDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 90, skipped: 0, pct: 90 },
          statements: { total: 100, covered: 90, skipped: 0, pct: 90 },
          functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
          branches: { total: 40, covered: 30, skipped: 0, pct: 75 },
        },
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    db.close();
    vi.resetAllMocks();
    await rm(workingDir, { recursive: true, force: true });
  });

  it('allows in_progress -> in_review transition after quality tools write evidence', async () => {
    vi.mocked(safeSpawn).mockResolvedValue({
      stdout: JSON.stringify([
        {
          filePath: '/src/a.ts',
          errorCount: 0,
          warningCount: 0,
          messages: [],
        },
      ]),
      stderr: '',
      exitCode: 0,
      durationMs: 8,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });

    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Pipeline task', scope: 'minor' });
    const taskId = (created.details as { task: { id: string } }).task.id;

    const transitionTool = taskTransitionToolDef(deps);
    let transition = await transitionTool.execute('tr-1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });
    transition = await transitionTool.execute('tr-2', {
      id: taskId,
      toStatus: 'in_progress',
      agentId: 'dev',
      rev: (transition.details as { orchestratorState: { rev: number } }).orchestratorState.rev,
    });

    let task = deps.taskRepo.getById(taskId)!;
    const coverageTool = qualityCoverageToolDef(deps);
    await coverageTool.execute('cov', {
      taskId,
      agentId: 'dev',
      rev: task.rev,
      workingDir,
      summaryPath: 'coverage-summary.json',
      format: 'summary',
    });

    task = deps.taskRepo.getById(taskId)!;
    const lintTool = qualityLintToolDef(deps);
    await lintTool.execute('lint', {
      taskId,
      agentId: 'dev',
      rev: task.rev,
      engine: 'eslint',
    });

    task = deps.taskRepo.getById(taskId)!;
    const updateTool = taskUpdateToolDef(deps);
    await updateTool.execute('upd', {
      id: taskId,
      rev: task.rev,
      metadata: {
        ...task.metadata,
        dev_result: {
          ...(task.metadata.dev_result as Record<string, unknown>),
          diff_summary: 'Implemented feature',
          red_green_refactor_log: ['red', 'green'],
        },
      },
    });

    const orchestrator = deps.orchestratorRepo.getByTaskId(taskId)!;
    const finalTransition = await transitionTool.execute('tr-3', {
      id: taskId,
      toStatus: 'in_review',
      agentId: 'dev',
      rev: orchestrator.rev,
    });
    expect((finalTransition.details as { task: { status: string } }).task.status).toBe('in_review');
  });
});
