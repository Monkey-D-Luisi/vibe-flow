import { describe, expect, it } from 'vitest';
import {
  assertValidBranchName,
  assertValidLabelColor,
  assertValidLabelName,
  assertValidPrTitle,
  buildTaskBranchName,
} from '../../src/github/validation.js';

describe('github validation helpers', () => {
  it('should build and validate a task branch name', () => {
    const branch = buildTaskBranchName('TASK-1', 'feature');
    expect(branch).toBe('task/TASK-1-feature');
    expect(() => assertValidBranchName(branch)).not.toThrow();
  });

  it('should reject invalid branch names', () => {
    expect(() => assertValidBranchName('feature/no-prefix')).toThrow(/must start with "task\/"/);
    expect(() => assertValidBranchName('task/TASK 1-feature')).toThrow(/Invalid branch/);
  });

  it('should validate PR titles and labels', () => {
    expect(() => assertValidPrTitle('Good title')).not.toThrow();
    expect(() => assertValidPrTitle('Bad;title')).toThrow(/metacharacters/);

    expect(() => assertValidLabelName('infra ready')).not.toThrow();
    expect(() => assertValidLabelName('bad@label')).toThrow(/Invalid label name/);

    expect(() => assertValidLabelColor('abc123')).not.toThrow();
    expect(() => assertValidLabelColor('xyz')).toThrow(/Invalid label color/);
  });
});
