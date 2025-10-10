import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskRepository } from '../src/repo/sqlite.js';
import { TaskRecordValidator } from '../src/domain/TaskRecord.js';

describe('Task Transitions', () => {
  let repo: TaskRepository;

  beforeEach(() => {
    repo = new TaskRepository(':memory:');
  });

  afterEach(() => {
    repo.close();
  });

  describe('dev -> review', () => {
    it('should fail without red_green_refactor_log', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'dev'
      });

      const validation = TaskRecordValidator.validateTransition('dev', 'review', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Quality gate failed');
    });

    it('should fail without coverage >= 0.7 for minor scope', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'dev'
      });

      const updated = repo.update(task.id, 0, {
        red_green_refactor_log: ['red: 4 failing', 'green: all passing'],
        metrics: { coverage: 0.6 }
      });

      const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Quality gate failed');
    });

    it('should fail with lint errors', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'dev'
      });

      const updated = repo.update(task.id, 0, {
        red_green_refactor_log: ['red: 4 failing', 'green: all passing'],
        metrics: { coverage: 0.8, lint: { errors: 1, warnings: 0 } }
      });

      const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Quality gate failed');
    });

    it('should pass with log, coverage, and no lint errors', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'dev'
      });

      const updated = repo.update(task.id, 0, {
        red_green_refactor_log: ['red: 4 failing', 'green: all passing'],
        metrics: { coverage: 0.8, lint: { errors: 0, warnings: 0 } }
      });

      const validation = TaskRecordValidator.validateTransition('dev', 'review', updated);
      expect(validation.valid).toBe(true);
    });
  });

  describe('review -> dev', () => {
    it('should always pass and increment rounds_review', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'review'
      });

      const validation = TaskRecordValidator.validateTransition('review', 'dev', task);
      expect(validation.valid).toBe(true);
    });

    it('should fail after 2 rounds', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'review',
        rounds_review: 2
      });

      const validation = TaskRecordValidator.validateTransition('review', 'dev', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Maximum review rounds (2) exceeded');
    });
  });

  describe('review -> po_check', () => {
    it('should pass without high violations', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'review'
      });

      const validation = TaskRecordValidator.validateTransition('review', 'po_check', task, {
        violations: [{ severity: 'low' }]
      });
      expect(validation.valid).toBe(true);
    });

    it('should fail with high violations', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'review'
      });

      const validation = TaskRecordValidator.validateTransition('review', 'po_check', task, {
        violations: [{ severity: 'high' }]
      });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('High severity violations must be resolved');
    });
  });

  describe('po_check -> qa', () => {
    it('should pass with acceptance criteria met', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po_check'
      });

      const validation = TaskRecordValidator.validateTransition('po_check', 'qa', task, {
        acceptance_criteria_met: true
      });
      expect(validation.valid).toBe(true);
    });

    it('should fail without acceptance criteria met', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po_check'
      });

      const validation = TaskRecordValidator.validateTransition('po_check', 'qa', task, {
        acceptance_criteria_met: false
      });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Acceptance criteria must be approved by PO');
    });
  });

  describe('qa -> dev', () => {
    it('should pass with qa_report', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'qa'
      });

      const validation = TaskRecordValidator.validateTransition('qa', 'dev', task, {
        qa_report: { failed: 2 }
      });
      expect(validation.valid).toBe(true);
    });

    it('should fail without qa_report', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'qa'
      });

      const validation = TaskRecordValidator.validateTransition('qa', 'dev', task, {});
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('QA report required for failed QA');
    });
  });

  describe('qa -> pr', () => {
    it('should pass with qa_report.failed == 0', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'qa',
        qa_report: { total: 10, passed: 10, failed: 0 }
      });

      const validation = TaskRecordValidator.validateTransition('qa', 'pr', task);
      expect(validation.valid).toBe(true);
    });

    it('should fail with qa_report.failed > 0', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'qa',
        qa_report: { total: 10, passed: 9, failed: 1 }
      });

      const validation = TaskRecordValidator.validateTransition('qa', 'pr', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('QA must pass with 0 failures');
    });
  });

  describe('pr -> done', () => {
    it('should pass with merged=true', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'pr'
      });

      const validation = TaskRecordValidator.validateTransition('pr', 'done', task, {
        merged: true
      });
      expect(validation.valid).toBe(true);
    });

    it('should fail with merged=false', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'pr'
      });

      const validation = TaskRecordValidator.validateTransition('pr', 'done', task, {
        merged: false
      });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('PR must be merged to complete');
    });
  });

  describe('invalid transitions', () => {
    it('should reject dev -> done', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'dev'
      });

      const validation = TaskRecordValidator.validateTransition('dev', 'done', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Invalid transition');
    });

    it('should reject done -> any state', () => {
      const task = repo.create({
        id: 'TR-01',
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'done'
      });

      const validation = TaskRecordValidator.validateTransition('done', 'dev', task);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Invalid transition');
    });
  });
});