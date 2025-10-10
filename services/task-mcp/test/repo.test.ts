import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskRepository } from '../src/repo/sqlite.js';

describe('TaskRepository', () => {
  let repo: TaskRepository;

  beforeEach(() => {
    repo = new TaskRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('should create and get task', () => {
    const task = repo.create({
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po'
    });
    expect(task.id).toBe('TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C');
    expect(task.rev).toBe(0);

    const retrieved = repo.get(task.id);
    expect(retrieved).toMatchObject(task);
  });

  it('should update with optimistic locking', () => {
    const task = repo.create({
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
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
    repo.create({
      id: 'TR-01',
      title: 'Search Test',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po'
    });
    repo.create({
      id: 'TR-02',
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