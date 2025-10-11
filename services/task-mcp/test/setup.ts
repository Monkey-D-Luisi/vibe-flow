import { vi } from 'vitest';

// Mock all schema requires globally
vi.mock('../../../packages/schemas/po_brief.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } },
      scope: { type: 'string', enum: ['minor', 'major'] },
      non_functional: { type: 'array', items: { type: 'string' } },
      done_if: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
  }
}));

vi.mock('../../../packages/schemas/design_ready.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      modules: { type: 'array', items: { type: 'string' } },
      contracts: { type: 'array' },
      patterns: { type: 'array' },
      adr_id: { type: 'string' },
      test_plan: { type: 'array', items: { type: 'string' } }
    },
    required: ['modules', 'contracts', 'patterns', 'adr_id', 'test_plan']
  }
}));

vi.mock('../../../packages/schemas/dev_work_output.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      diff_summary: { type: 'string' },
      metrics: {
        type: 'object',
        properties: {
          coverage: { type: 'number' },
          lint: {
            type: 'object',
            properties: { errors: { type: 'integer' }, warnings: { type: 'integer' } }
          }
        }
      },
      red_green_refactor_log: { type: 'array', items: { type: 'string' } }
    },
    required: ['diff_summary', 'metrics', 'red_green_refactor_log']
  }
}));

vi.mock('../../../packages/schemas/reviewer_report.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      violations: { type: 'array' },
      summary: { type: 'string' }
    },
    required: ['violations', 'summary']
  }
}));

vi.mock('../../../packages/schemas/qa_report.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      passed: { type: 'integer' },
      failed: { type: 'integer' },
      evidence: { type: 'array', items: { type: 'string' } }
    },
    required: ['total', 'passed', 'failed', 'evidence']
  }
}));

vi.mock('../../../packages/schemas/pr_summary.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      branch: { type: 'string' },
      pr_url: { type: 'string' },
      checklist: { type: 'array', items: { type: 'string' } }
    },
    required: ['branch', 'pr_url', 'checklist']
  }
}));