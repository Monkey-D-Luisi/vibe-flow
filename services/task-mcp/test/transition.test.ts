import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskRepository } from '../src/repo/sqlite.js';
import { TaskRecordValidator } from '../src/domain/TaskRecord.js';

describe('Transition dev to review', () => {
  let repo: TaskRepository;

  beforeEach(() => {
    repo = new TaskRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  it('should fail dev to review without red_green_refactor_log', () => {
    const task = repo.create({
      id: 'TR-01',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'dev'
    });

    const validation = TaskRecordValidator.validateTransition('dev', 'review', task);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('red_green_refactor_log must have at least 2 entries');
  });

  it('should pass dev to review with log and coverage', () => {
    const task = repo.create({
      id: 'TR-01',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'dev'
    });

    const updated = repo.update(task.id, 0, {
      red_green_refactor_log: ['red: 4 failing', 'green: all passing'],
      metrics: { coverage: 0.8 }
    });

    const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
    expect(validation.valid).toBe(true);
  });
});