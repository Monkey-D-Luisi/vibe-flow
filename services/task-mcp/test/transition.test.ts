import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { TaskRepository } from '../src/repo/repository.js';
import { TaskRecordValidator } from '../src/domain/TaskRecord.js';

describe('Task Transitions', () => {
  let repo: TaskRepository;

  const newTaskId = () => `TR-${ulid()}`;
  const createTask = (overrides: Record<string, unknown>) =>
    repo.create({
      id: newTaskId(),
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po',
      ...overrides
    });

  beforeEach(() => {
    repo = new TaskRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  describe('po -> arch', () => {
    it('allows transition for major scope tasks', () => {
      const task = createTask({ scope: 'major', status: 'po' });
      const validation = TaskRecordValidator.validateTransition('po', 'arch', task);
      expect(validation.valid).toBe(true);
    });
  });

  describe('dev -> review', () => {
    it('fails without RGR log evidence', () => {
      const task = createTask({ status: 'dev' });
      const validation = TaskRecordValidator.validateTransition('dev', 'review', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Quality gate failed');
    });

    it('fails with insufficient coverage for minor scope', () => {
      const task = createTask({ status: 'dev' });
      const updated = repo.update(task.id, task.rev, {
        red_green_refactor_log: ['red: failing', 'green: passing'],
        metrics: { coverage: 0.6, lint: { errors: 0, warnings: 0 } }
      });
      const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
      expect(validation.valid).toBe(false);
    });

    it('passes with RGR log and sufficient coverage', () => {
      const task = createTask({ status: 'dev' });
      const updated = repo.update(task.id, task.rev, {
        red_green_refactor_log: ['red: failing', 'green: passing'],
        metrics: { coverage: 0.82, lint: { errors: 0, warnings: 0 } }
      });
      const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
      expect(validation.valid).toBe(true);
    });
  });

  describe('po -> dev (fast-track)', () => {
    it('requires fast-track eligibility tags', () => {
      const task = createTask({ status: 'po' });
      const invalid = TaskRecordValidator.validateTransition('po', 'dev', task);
      expect(invalid.valid).toBe(false);

      const tagged = repo.update(task.id, task.rev, {
        tags: ['fast-track', 'fast-track:eligible']
      });
      const valid = TaskRecordValidator.validateTransition('po', 'dev', tagged);
      expect(valid.valid).toBe(true);
    });
  });

  describe('review -> dev', () => {
    it('passes and increments review rounds when returning to dev', () => {
      const task = createTask({ status: 'review' });
      const validation = TaskRecordValidator.validateTransition('review', 'dev', task);
      expect(validation.valid).toBe(true);
    });

    it('blocks after exceeding allowed review rounds', () => {
      const task = createTask({ status: 'review', rounds_review: 3 });
      const validation = TaskRecordValidator.validateTransition('review', 'dev', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Maximum review rounds (2) exceeded');
    });
  });

  describe('review -> po_check', () => {
    it('passes when no high severity violations exist', () => {
      const task = createTask({ status: 'review' });
      const validation = TaskRecordValidator.validateTransition('review', 'po_check', task, { violations: [] });
      expect(validation.valid).toBe(true);
    });

    it('fails when a high severity violation remains', () => {
      const task = createTask({ status: 'review' });
      const validation = TaskRecordValidator.validateTransition('review', 'po_check', task, {
        violations: [{ severity: 'high', description: 'critical issue' }]
      });
      expect(validation.valid).toBe(false);
    });
  });

  describe('po_check -> qa', () => {
    it('passes when PO confirms acceptance criteria', () => {
      const task = createTask({ status: 'po_check' });
      const validation = TaskRecordValidator.validateTransition('po_check', 'qa', task, {
        acceptance_criteria_met: true
      });
      expect(validation.valid).toBe(true);
    });

    it('fails when PO confirmation is missing', () => {
      const task = createTask({ status: 'po_check' });
      const validation = TaskRecordValidator.validateTransition('po_check', 'qa', task, {
        acceptance_criteria_met: false
      });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Acceptance criteria must be approved by PO');
    });
  });

  describe('qa -> dev', () => {
    it('passes when returning with QA report', () => {
      const task = createTask({ status: 'qa' });
      const validation = TaskRecordValidator.validateTransition('qa', 'dev', task, {
        qa_report: { failed: 2, passed: 8 }
      });
      expect(validation.valid).toBe(true);
    });

    it('fails when QA report is missing', () => {
      const task = createTask({ status: 'qa' });
      const validation = TaskRecordValidator.validateTransition('qa', 'dev', task, {});
      expect(validation.valid).toBe(false);
    });
  });

  describe('qa -> pr', () => {
    it('passes when QA report has zero failures', () => {
      const task = createTask({
        status: 'qa',
        qa_report: { total: 10, failed: 0, passed: 10 }
      });
      const validation = TaskRecordValidator.validateTransition('qa', 'pr', task);
      expect(validation.valid).toBe(true);
    });

    it('fails when QA report indicates failures', () => {
      const task = createTask({
        status: 'qa',
        qa_report: { total: 10, failed: 1, passed: 9 }
      });
      const validation = TaskRecordValidator.validateTransition('qa', 'pr', task);
      expect(validation.valid).toBe(false);
    });
  });

  describe('pr -> done', () => {
    it('passes when PR is merged', () => {
      const task = createTask({ status: 'pr' });
      const validation = TaskRecordValidator.validateTransition('pr', 'done', task, { merged: true });
      expect(validation.valid).toBe(true);
    });

    it('fails when PR is not merged', () => {
      const task = createTask({ status: 'pr' });
      const validation = TaskRecordValidator.validateTransition('pr', 'done', task, { merged: false });
      expect(validation.valid).toBe(false);
    });
  });

  describe('invalid transitions', () => {
    it('rejects dev -> done', () => {
      const task = createTask({ status: 'dev' });
      const validation = TaskRecordValidator.validateTransition('dev', 'done', task);
      expect(validation.valid).toBe(false);
    });

    it('rejects transitions from done state', () => {
      const task = createTask({ status: 'done' });
      const validation = TaskRecordValidator.validateTransition('done', 'dev', task);
      expect(validation.valid).toBe(false);
    });
  });
});
