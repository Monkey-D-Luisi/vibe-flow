import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
import { qualityComplexityToolDef } from '../../src/tools/quality-complexity.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01QCOMP_${String(++idCounter).padStart(10, '0')}`;
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

describe('quality.complexity tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;
  let workingDir: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Complexity task' });
    taskId = (created.details as { task: { id: string } }).task.id;
    workingDir = await mkdtemp(join(tmpdir(), 'complexity-tool-'));
    await mkdir(join(workingDir, 'src'));
    await writeFile(
      join(workingDir, 'src', 'sample.ts'),
      `
      export function sample(a: number): number {
        if (a > 0) {
          return a;
        }
        return 0;
      }
      `,
      'utf8',
    );
  });

  afterEach(async () => {
    db.close();
    await rm(workingDir, { recursive: true, force: true });
  });

  it('stores complexity summary and quality.complexity evidence', async () => {
    const tool = qualityComplexityToolDef(deps);
    const result = await tool.execute('complex-1', {
      taskId,
      agentId: 'dev',
      rev: 0,
      engine: 'tsmorph',
      globs: ['src/**/*.ts'],
      workingDir,
    });

    const metadata = (result.details as { task: { metadata: Record<string, unknown> } }).task.metadata;
    const complexity = metadata.complexity as Record<string, unknown>;
    expect(typeof complexity.avg).toBe('number');
    expect(typeof complexity.max).toBe('number');
    expect(complexity.files).toBe(1);
    const quality = metadata.quality as Record<string, unknown>;
    expect(quality.complexity).toBeDefined();

    const events = deps.eventLog
      .getHistory(taskId)
      .filter((event) => event.eventType === 'quality.complexity');
    expect(events).toHaveLength(1);
  });
});
