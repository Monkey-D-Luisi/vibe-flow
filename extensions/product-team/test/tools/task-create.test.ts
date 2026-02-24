import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('task.create tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    const orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);
    const generateId = () => `01TOOL_${String(++idCounter).padStart(10, '0')}`;
    const now = () => NOW;
    const eventLog = new EventLog(eventRepo, generateId, now);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
    };
  });

  afterEach(() => {
    db?.close();
  });

  it('should create a task with valid input', async () => {
    const tool = taskCreateToolDef(deps);
    const result = await tool.execute('call-1', { title: 'New task' });

    expect(result.details).toHaveProperty('task');
    const { task } = result.details as { task: { id: string; title: string; status: string; rev: number } };
    expect(task.title).toBe('New task');
    expect(task.status).toBe('backlog');
    expect(task.rev).toBe(0);
    expect(task.id).toBeTruthy();
  });

  it('should return text content as JSON', async () => {
    const tool = taskCreateToolDef(deps);
    const result = await tool.execute('call-1', { title: 'New task' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.task.title).toBe('New task');
  });

  it('should create orchestrator_state atomically', async () => {
    const tool = taskCreateToolDef(deps);
    const result = await tool.execute('call-1', { title: 'New task' });
    const { task } = result.details as { task: { id: string } };

    const orchState = deps.orchestratorRepo.getByTaskId(task.id);
    expect(orchState).not.toBeNull();
    expect(orchState!.current).toBe('backlog');
  });

  it('should log task.created event', async () => {
    const tool = taskCreateToolDef(deps);
    const result = await tool.execute('call-1', { title: 'New task' });
    const { task } = result.details as { task: { id: string } };

    const events = deps.eventLog.getHistory(task.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('task.created');
  });

  it('should reject empty title', async () => {
    const tool = taskCreateToolDef(deps);
    await expect(tool.execute('call-1', { title: '' })).rejects.toThrow(
      /[Vv]alidation/,
    );
  });

  it('should accept optional fields', async () => {
    const tool = taskCreateToolDef(deps);
    const result = await tool.execute('call-1', {
      title: 'Full task',
      scope: 'major',
      assignee: 'agent-pm',
      tags: ['feature'],
      metadata: { priority: 'high' },
    });

    const { task } = result.details as { task: { scope: string; assignee: string; tags: string[]; metadata: Record<string, unknown> } };
    expect(task.scope).toBe('major');
    expect(task.assignee).toBe('agent-pm');
    expect(task.tags).toEqual(['feature']);
    expect(task.metadata).toEqual({ priority: 'high' });
  });
});
