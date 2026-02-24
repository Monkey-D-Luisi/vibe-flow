import { describe, expect, it } from 'vitest';
import { createValidator } from '../../src/schemas/validator.js';
import { VcsBranchCreateParams } from '../../src/schemas/vcs-branch-create.schema.js';
import { VcsPrCreateParams } from '../../src/schemas/vcs-pr-create.schema.js';
import { VcsPrUpdateParams } from '../../src/schemas/vcs-pr-update.schema.js';
import { VcsLabelSyncParams } from '../../src/schemas/vcs-label-sync.schema.js';

const validate = createValidator();

describe('VCS schemas', () => {
  it('should validate vcs.branch.create params', () => {
    expect(() =>
      validate(VcsBranchCreateParams, { taskId: 'TASK-1', slug: 'feature-one' }),
    ).not.toThrow();

    expect(() =>
      validate(VcsBranchCreateParams, { taskId: 'TASK-1', slug: 'Invalid Slug' }),
    ).toThrow();
  });

  it('should validate vcs.pr.create params', () => {
    expect(() =>
      validate(VcsPrCreateParams, { taskId: 'TASK-1', title: 'PR title' }),
    ).not.toThrow();

    expect(() =>
      validate(VcsPrCreateParams, { taskId: 'TASK-1', title: '' }),
    ).toThrow();
  });

  it('should validate vcs.pr.update params', () => {
    expect(() =>
      validate(VcsPrUpdateParams, {
        taskId: 'TASK-1',
        prNumber: 10,
        state: 'closed',
      }),
    ).not.toThrow();

    expect(() =>
      validate(VcsPrUpdateParams, {
        taskId: 'TASK-1',
        prNumber: 0,
      }),
    ).toThrow();

    expect(() =>
      validate(VcsPrUpdateParams, {
        taskId: 'TASK-1',
        prNumber: 10,
        labels: [],
      }),
    ).toThrow();
  });

  it('should validate vcs.label.sync params', () => {
    expect(() =>
      validate(VcsLabelSyncParams, {
        taskId: 'TASK-1',
        labels: [{ name: 'infra', color: 'abcdef' }],
      }),
    ).not.toThrow();

    expect(() =>
      validate(VcsLabelSyncParams, {
        taskId: 'TASK-1',
        labels: [{ name: 'infra', color: 'abc' }],
      }),
    ).toThrow();
  });
});
