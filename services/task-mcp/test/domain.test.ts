import { describe, it, expect } from 'vitest';
import { TaskRecordValidator } from '../src/domain/TaskRecord.js';

describe('TaskRecordValidator', () => {
  describe('validateSchema', () => {
    it('should accept valid ULID', () => {
      const record = {
        id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
        title: 'Valid title',
        acceptance_criteria: ['criteria'],
        scope: 'minor',
        status: 'po',
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateSchema(record)).toBe(true);
    });

    it('should reject invalid branch', () => {
      const record = {
        id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
        title: 'Valid title',
        acceptance_criteria: ['criteria'],
        scope: 'minor',
        status: 'po',
        branch: 'invalid-branch',
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateSchema(record)).toBe(false);
    });

    it('should reject invalid task id format', () => {
      const record = {
        id: 'INVALID-ID',
        title: 'Valid title',
        acceptance_criteria: ['criteria'],
        scope: 'minor',
        status: 'po',
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateSchema(record)).toBe(false);
    });
  });

  describe('validateCreation', () => {
    it('should validate required fields', () => {
      const input = {
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor' as const
      };
      expect(TaskRecordValidator.validateCreation(input).valid).toBe(true);
    });

    it('should reject short title', () => {
      const input = {
        title: 'Hi',
        acceptance_criteria: ['test'],
        scope: 'minor' as const
      };
      expect(TaskRecordValidator.validateCreation(input).valid).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should allow dev to review with evidence', () => {
      const record = {
        id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
        title: 'Test',
        acceptance_criteria: ['test'],
        scope: 'minor' as const,
        status: 'dev' as const,
        red_green_refactor_log: ['red: failing', 'green: passing'],
        metrics: { coverage: 0.8 },
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateTransition('dev', 'review', record).valid).toBe(true);
    });

    it('should reject dev to review without log', () => {
      const record = {
        id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
        title: 'Test',
        acceptance_criteria: ['test'],
        scope: 'minor' as const,
        status: 'dev' as const,
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateTransition('dev', 'review', record).valid).toBe(false);
    });

    it('should reject dev to review with low coverage for major', () => {
      const record = {
        id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
        title: 'Test',
        acceptance_criteria: ['test'],
        scope: 'major' as const,
        status: 'dev' as const,
        red_green_refactor_log: ['red: failing', 'green: passing'],
        metrics: { coverage: 0.7 },
        rev: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };
      expect(TaskRecordValidator.validateTransition('dev', 'review', record).valid).toBe(false);
    });
  });
});
