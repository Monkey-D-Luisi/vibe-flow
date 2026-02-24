import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  ALL_STATUSES,
  VALID_TRANSITIONS,
  isValidTransition,
} from '../../src/domain/task-status.js';

describe('TaskStatus', () => {
  it('should define all seven status values', () => {
    expect(ALL_STATUSES).toEqual([
      'backlog',
      'grooming',
      'design',
      'in_progress',
      'in_review',
      'qa',
      'done',
    ]);
  });

  it('should have transition entries for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(VALID_TRANSITIONS.has(status)).toBe(true);
    }
  });
});

describe('isValidTransition', () => {
  describe('valid forward transitions', () => {
    const validCases: [TaskStatus, TaskStatus][] = [
      ['backlog', 'grooming'],
      ['grooming', 'design'],
      ['grooming', 'in_progress'],
      ['design', 'in_progress'],
      ['in_progress', 'in_review'],
      ['in_review', 'qa'],
      ['in_review', 'in_progress'],
      ['qa', 'done'],
      ['qa', 'in_progress'],
    ];

    for (const [from, to] of validCases) {
      it(`should allow ${from} -> ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    }
  });

  describe('invalid transitions', () => {
    const invalidCases: [TaskStatus, TaskStatus][] = [
      ['backlog', 'design'],
      ['backlog', 'in_progress'],
      ['backlog', 'done'],
      ['grooming', 'qa'],
      ['design', 'qa'],
      ['in_progress', 'done'],
      ['in_progress', 'backlog'],
      ['done', 'backlog'],
      ['done', 'in_progress'],
    ];

    for (const [from, to] of invalidCases) {
      it(`should reject ${from} -> ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    }
  });

  describe('terminal state', () => {
    it('should have no outbound transitions from done', () => {
      const targets = VALID_TRANSITIONS.get(TaskStatus.Done);
      expect(targets).toEqual([]);
    });

    it('should reject all transitions from done', () => {
      for (const status of ALL_STATUSES) {
        expect(isValidTransition(TaskStatus.Done, status)).toBe(false);
      }
    });
  });

  describe('self-transitions', () => {
    it('should reject all self-transitions', () => {
      for (const status of ALL_STATUSES) {
        expect(isValidTransition(status, status)).toBe(false);
      }
    });
  });
});
