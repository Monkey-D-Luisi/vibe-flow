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
import { qualityCoverageToolDef } from '../../src/tools/quality-coverage.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QCOV_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.coverage tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;
  let workingDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Coverage task' });
    taskId = (created.details as { task: { id: string } }).task.id;

    workingDir = await mkdtemp(join(tmpdir(), 'coverage-tool-'));
    await writeFile(
      join(workingDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
          statements: { total: 100, covered: 84, skipped: 0, pct: 84 },
          functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
          branches: { total: 40, covered: 30, skipped: 0, pct: 75 },
        },
        'src/index.ts': {
          lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
          statements: { total: 10, covered: 8, skipped: 0, pct: 80 },
          functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
          branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
        },
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    db.close();
    await rm(workingDir, { recursive: true, force: true });
  });

  it('stores coverage metrics in dev_result and quality branch', async () => {
    const tool = qualityCoverageToolDef(deps);
    const result = await tool.execute('cov-1', {
      taskId,
      agentId: 'dev',
      rev: 0,
      workingDir,
      summaryPath: 'coverage-summary.json',
      format: 'summary',
    });

    const metadata = (result.details as { task: { metadata: Record<string, unknown> } }).task.metadata;
    const devResult = metadata.dev_result as Record<string, unknown>;
    const metrics = devResult.metrics as Record<string, unknown>;
    expect(metrics.coverage).toBe(85);

    const quality = metadata.quality as Record<string, unknown>;
    expect(quality.coverage).toBeDefined();

    const events = deps.eventLog.getHistory(taskId).filter((event) => event.eventType === 'quality.coverage');
    expect(events).toHaveLength(1);
  });
});
