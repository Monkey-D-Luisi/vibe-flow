import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateAgentOutput } from '../src/orchestrator/runner.js';
import { AgentType } from '../src/orchestrator/router.js';

// Mock file system operations
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

vi.mock('path', () => ({
  fileURLToPath: vi.fn(() => '/mock/path'),
  dirname: vi.fn(() => '/mock/dir'),
  join: vi.fn((...args) => args.join('/'))
}));

describe('Runner', () => {
  describe('validateAgentOutput', () => {
    const mockReadFileSync = vi.mocked(require('fs').readFileSync);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should validate valid PO output', () => {
      const validOutput = {
        title: 'Implement user login',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor',
        non_functional: ['Security: AES encryption'],
        done_if: ['Login works', 'Security tests pass']
      };

      const mockSchema = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          scope: { type: 'string', enum: ['minor', 'major'] },
          non_functional: { type: 'array', items: { type: 'string' } },
          done_if: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockSchema));

      expect(() => validateAgentOutput('po', validOutput)).not.toThrow();
      const result = validateAgentOutput('po', validOutput);
      expect(result.title).toBe('Implement user login');
    });

    it('should validate valid dev output', () => {
      const validOutput = {
        diff_summary: 'Implemented UserService with TDD',
        metrics: {
          coverage: 0.85,
          lint: { errors: 0, warnings: 2 }
        },
        red_green_refactor_log: ['RED: test fails', 'GREEN: implemented']
      };

      const mockSchema = {
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
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockSchema));

      expect(() => validateAgentOutput('dev', validOutput)).not.toThrow();
      const result = validateAgentOutput('dev', validOutput);
      expect(result.diff_summary).toBe('Implemented UserService with TDD');
    });

    it('should reject invalid output', () => {
      const invalidOutput = {
        title: 'Test task'
        // missing required fields
      };

      const mockSchema = {
        type: 'object',
        required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(mockSchema));

      expect(() => validateAgentOutput('po', invalidOutput)).toThrow('Agent po output validation failed');
    });

    it('should handle file read errors', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const validOutput = { title: 'Test' };

      expect(() => validateAgentOutput('po', validOutput)).toThrow('Failed to load schema for po');
    });

    it('should handle invalid JSON in schema file', () => {
      mockReadFileSync.mockReturnValue('invalid json');

      const validOutput = { title: 'Test' };

      expect(() => validateAgentOutput('po', validOutput)).toThrow('Failed to load schema for po');
    });

    it('should validate all agent types', () => {
      const agentTypes: AgentType[] = ['po', 'architect', 'dev', 'reviewer', 'qa', 'prbot'];

      agentTypes.forEach(agentType => {
        const mockSchema = { type: 'object', required: [] };
        mockReadFileSync.mockReturnValue(JSON.stringify(mockSchema));

        expect(() => validateAgentOutput(agentType, {})).not.toThrow();
      });
    });
  });
});