import { describe, expect, it } from 'vitest';
import { buildDefaultPrBody } from '../../src/github/pr-template.js';

describe('buildDefaultPrBody', () => {
  it('should include task metadata and acceptance criteria in the generated template', () => {
    const body = buildDefaultPrBody({
      id: 'TASK-1',
      title: 'Implement github integration',
      status: 'in_progress',
      scope: 'major',
      assignee: null,
      tags: [],
      metadata: {
        acceptance_criteria: ['AC1', 'AC2'],
      },
      createdAt: '2026-02-24T12:00:00.000Z',
      updatedAt: '2026-02-24T12:00:00.000Z',
      rev: 0,
    });

    expect(body).toContain('## Summary');
    expect(body).toContain('Task ID: TASK-1');
    expect(body).toContain('- AC1');
    expect(body).toContain('- AC2');
  });
});
