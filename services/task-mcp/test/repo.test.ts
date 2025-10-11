import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { TaskRepository } from '../src/repo/sqlite.js';

const newTaskId = () => `TR-${ulid()}`;

describe('TaskRepository', () => {
  let repo: TaskRepository;

  beforeEach(() => {
    repo = new TaskRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('should create and get task', () => {
    const id = newTaskId();
    const task = repo.create({
      id,
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po'
    });
    expect(task.id).toBe(id);
    expect(task.rev).toBe(0);

    const retrieved = repo.get(task.id);
    expect(retrieved).toMatchObject(task);
  });

  it('should update with optimistic locking', () => {
    const id = newTaskId();
    const task = repo.create({
      id,
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po'
    });

    const updated = repo.update(task.id, 0, { title: 'Updated Title' });
    expect(updated.title).toBe('Updated Title');
    expect(updated.rev).toBe(1);

    expect(() => repo.update(task.id, 0, { title: 'Fail' })).toThrow('Optimistic lock failed');
  });

  it('should search tasks', () => {
    const firstId = newTaskId();
    repo.create({
      id: firstId,
      title: 'Search Test',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po'
    });
    repo.create({
      id: newTaskId(),
      title: 'Another Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'dev'
    });

    const result = repo.search({ q: 'Search' });
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Search Test');

    const statusResult = repo.search({ status: ['dev'] });
    expect(statusResult.items.length).toBe(1);
    expect(statusResult.items[0].status).toBe('dev');
  });
});
