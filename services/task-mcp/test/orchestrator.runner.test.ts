import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAgentOutput } from '../src/orchestrator/runner.js';
import { AgentType } from '../src/orchestrator/router.js';
import fs from 'fs';

// Mock file system operations
vi.mock('fs', () => {
  const mockReadFileSync = vi.fn();
  return {
    readFileSync: mockReadFileSync,
    default: { readFileSync: mockReadFileSync }
  };
});

vi.mock('path', () => ({
  fileURLToPath: vi.fn(() => '/mock/path'),
  dirname: vi.fn(() => '/mock/dir'),
  join: vi.fn((...args) => args.join('/'))
}));

// Mock the import.meta.url to avoid path resolution issues
vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mock/path')
}));

// Mock schemas for different agent types
const mockSchemas = {
  'po_brief.schema.json': {
    type: 'object',
    properties: {
      title: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } },
      scope: { type: 'string', enum: ['minor', 'major'] },
      non_functional: { type: 'array', items: { type: 'string' } },
      done_if: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
  },
  'design_ready.schema.json': {
    type: 'object',
    properties: {
      modules: { type: 'array', items: { type: 'string' } },
      contracts: { type: 'array' },
      patterns: { type: 'array' },
      adr_id: { type: 'string' },
      test_plan: { type: 'array', items: { type: 'string' } }
    },
    required: ['modules', 'contracts', 'patterns', 'adr_id', 'test_plan']
  },
  'dev_work_output.schema.json': {
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
  },
  'reviewer_report.schema.json': {
    type: 'object',
    properties: {
      violations: { type: 'array' },
      summary: { type: 'string' }
    },
    required: ['violations', 'summary']
  },
  'qa_report.schema.json': {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      passed: { type: 'integer' },
      failed: { type: 'integer' },
      evidence: { type: 'array', items: { type: 'string' } }
    },
    required: ['total', 'passed', 'failed', 'evidence']
  },
  'pr_summary.schema.json': {
    type: 'object',
    properties: {
      branch: { type: 'string' },
      pr_url: { type: 'string' },
      checklist: { type: 'array', items: { type: 'string' } }
    },
    required: ['branch', 'pr_url', 'checklist']
  }
};

describe('Runner', () => {
  describe('validateAgentOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock to return PO schema
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSchemas['po_brief.schema.json']));
  });    it('should validate valid PO output', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSchemas['po_brief.schema.json']));

      const validOutput = {
        title: 'Implement user login',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor',
        non_functional: ['Security: AES encryption'],
        done_if: ['Login works', 'Security tests pass']
      };

      expect(() => validateAgentOutput('po', validOutput)).not.toThrow();
      const result = validateAgentOutput('po', validOutput);
      expect(result.title).toBe('Implement user login');
    });

    it('should validate valid dev output', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSchemas['dev_work_output.schema.json']));

      const validOutput = {
        diff_summary: 'Implemented UserService with TDD',
        metrics: {
          coverage: 0.85,
          lint: { errors: 0, warnings: 2 }
        },
        red_green_refactor_log: ['RED: test fails', 'GREEN: implemented']
      };

      expect(() => validateAgentOutput('dev', validOutput)).not.toThrow();
      const result = validateAgentOutput('dev', validOutput);
      expect(result.diff_summary).toBe('Implemented UserService with TDD');
    });

    it('should reject invalid output', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSchemas['po_brief.schema.json']));

      const invalidOutput = {
        title: 'Test task'
        // missing required fields
      };

      expect(() => validateAgentOutput('po', invalidOutput)).toThrow('Agent po output validation failed');
    });

    it('should handle file read errors', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const validOutput = { title: 'Test' };

      expect(() => validateAgentOutput('po', validOutput)).toThrow('Failed to load schema for po');
    });

    it('should handle invalid JSON in schema file', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const validOutput = { title: 'Test' };

      expect(() => validateAgentOutput('po', validOutput)).toThrow('Failed to load schema for po');
    });

    it('should validate all agent types', () => {
      const agentTypes: AgentType[] = ['po', 'architect', 'dev', 'reviewer', 'qa', 'prbot'];

      const validOutputs = {
        po: { title: 'Test', acceptance_criteria: ['test'], scope: 'minor', non_functional: ['test'], done_if: ['test'] },
        architect: { modules: ['test'], contracts: [{ name: 'Test', methods: ['test'] }], patterns: [{ name: 'test', where: 'test', why: 'test' }], adr_id: 'ADR-001', test_plan: ['test'] },
        dev: { diff_summary: 'test', metrics: { coverage: 0.8, lint: { errors: 0, warnings: 0 } }, red_green_refactor_log: ['test'] },
        reviewer: { violations: [], summary: 'test' },
        qa: { total: 1, passed: 1, failed: 0, evidence: ['test'] },
        prbot: { branch: 'feature/test', pr_url: 'https://github.com/test', checklist: ['test'] }
      };

      agentTypes.forEach(agentType => {
        const schemaFile = `${agentType === 'po' ? 'po_brief' : agentType === 'architect' ? 'design_ready' : agentType === 'dev' ? 'dev_work_output' : agentType === 'reviewer' ? 'reviewer_report' : agentType === 'qa' ? 'qa_report' : 'pr_summary'}.schema.json`;
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSchemas[schemaFile as keyof typeof mockSchemas]));

        expect(() => validateAgentOutput(agentType, validOutputs[agentType])).not.toThrow();
      });
    });
  });
});