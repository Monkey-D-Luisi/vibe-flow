import { describe, it, expect } from 'vitest';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import { TaskStatus } from '../../src/domain/task-status.js';

const TEST_ID = '01HZABCDEF1234567890ABCDEF';
const TEST_NOW = '2026-02-24T12:00:00.000Z';

describe('createTaskRecord', () => {
  it('should create a task with required fields', () => {
    const task = createTaskRecord({ title: 'Test task' }, TEST_ID, TEST_NOW);

    expect(task.id).toBe(TEST_ID);
    expect(task.title).toBe('Test task');
    expect(task.status).toBe(TaskStatus.Backlog);
    expect(task.createdAt).toBe(TEST_NOW);
    expect(task.updatedAt).toBe(TEST_NOW);
    expect(task.rev).toBe(0);
  });

  it('should apply default values for optional fields', () => {
    const task = createTaskRecord({ title: 'Test task' }, TEST_ID, TEST_NOW);

    expect(task.scope).toBe('minor');
    expect(task.assignee).toBeNull();
    expect(task.tags).toEqual([]);
    expect(task.metadata).toEqual({});
  });

  it('should use provided optional fields', () => {
    const task = createTaskRecord(
      {
        title: 'Full task',
        scope: 'major',
        assignee: 'agent-pm',
        tags: ['feature', 'auth'],
        metadata: { priority: 'high' },
      },
      TEST_ID,
      TEST_NOW,
    );

    expect(task.scope).toBe('major');
    expect(task.assignee).toBe('agent-pm');
    expect(task.tags).toEqual(['feature', 'auth']);
    expect(task.metadata).toEqual({ priority: 'high' });
  });

  it('should always start with backlog status', () => {
    const task = createTaskRecord({ title: 'Test' }, TEST_ID, TEST_NOW);
    expect(task.status).toBe('backlog');
  });

  it('should always start with rev 0', () => {
    const task = createTaskRecord({ title: 'Test' }, TEST_ID, TEST_NOW);
    expect(task.rev).toBe(0);
  });

  it('should accept null assignee explicitly', () => {
    const task = createTaskRecord(
      { title: 'Test', assignee: null },
      TEST_ID,
      TEST_NOW,
    );
    expect(task.assignee).toBeNull();
  });
});

describe('createOrchestratorState', () => {
  it('should create state with backlog as current', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);

    expect(state.taskId).toBe(TEST_ID);
    expect(state.current).toBe(TaskStatus.Backlog);
  });

  it('should start with no previous state', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);
    expect(state.previous).toBeNull();
  });

  it('should start with no agent', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);
    expect(state.lastAgent).toBeNull();
  });

  it('should start with zero review rounds', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);
    expect(state.roundsReview).toBe(0);
  });

  it('should start with rev 0', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);
    expect(state.rev).toBe(0);
  });

  it('should set updatedAt to provided timestamp', () => {
    const state = createOrchestratorState(TEST_ID, TEST_NOW);
    expect(state.updatedAt).toBe(TEST_NOW);
  });
});
