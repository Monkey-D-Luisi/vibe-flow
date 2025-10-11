import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgent, validateAgentOutput, runOrchestratorStep } from '../src/orchestrator/runner.js';

// Mock the repositories
vi.mock('../src/repo/sqlite.js', () => ({
  TaskRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    update: vi.fn()
  }))
}));

vi.mock('../src/repo/state.js', () => ({
  StateRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    update: vi.fn()
  })),
  EventRepository: vi.fn().mockImplementation(() => ({
    add: vi.fn()
  })),
  LeaseRepository: vi.fn().mockImplementation(() => ({
    acquire: vi.fn().mockReturnValue({ lease_id: 'lease-123' }),
    release: vi.fn()
  }))
}));

// Mock router functions
vi.mock('../src/orchestrator/router.js', () => ({
  nextAgent: vi.fn(),
  getAgentInputSchema: vi.fn(),
  getAgentOutputSchema: vi.fn()
}));

// Mock FastTrack
vi.mock('../src/domain/FastTrack.js', () => ({
  evaluateFastTrack: vi.fn(),
  guardPostDev: vi.fn()
}));

// Mock FastTrackGitHub
vi.mock('../src/domain/FastTrackGitHub.js', () => ({
  FastTrackGitHub: vi.fn().mockImplementation(() => ({
    handleFastTrackTransition: vi.fn()
  }))
}));

// Mock fs for schema validation
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

vi.mock('path', () => ({
  join: vi.fn(),
  dirname: vi.fn(),
  fileURLToPath: vi.fn()
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn()
}));

describe('Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runAgent', () => {
    it('should run po agent', async () => {
      const input = {
        title: 'Test Task',
        description: 'Test description',
        acceptance_criteria: ['criteria1'],
        scope: 'minor'
      };

      const result = await runAgent('po', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should run architect agent', async () => {
      const input = {
        title: 'Test Task',
        acceptance_criteria: ['criteria1'],
        scope: 'minor'
      };

      const result = await runAgent('architect', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should run dev agent', async () => {
      const input = {
        modules: ['UserService'],
        contracts: [{ name: 'UserRepository', methods: [] }],
        patterns: [{ name: 'Repository', where: 'data', why: 'abstraction' }]
      };

      const result = await runAgent('dev', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should run reviewer agent', async () => {
      const input = {
        diff_summary: 'Implemented UserService',
        metrics: { coverage: 0.85, lint: { errors: 0, warnings: 2 } },
        red_green_refactor_log: ['RED: test fails', 'GREEN: implemented']
      };

      const result = await runAgent('reviewer', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should run qa agent', async () => {
      const input = {
        violations: [{
          rule: 'SOLID',
          where: 'UserService',
          why: 'Single responsibility',
          severity: 'med',
          suggested_fix: 'Extract validator'
        }],
        summary: 'Good implementation'
      };

      const result = await runAgent('qa', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should run prbot agent', async () => {
      const input = {
        total: 25,
        passed: 23,
        failed: 2,
        evidence: ['Unit tests passed', 'Integration failed']
      };

      const result = await runAgent('prbot', input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('validateAgentOutput', () => {
    it('should validate po output', () => {
      // Mock fs.readFileSync
      const mockReadFileSync = vi.fn().mockReturnValue(JSON.stringify({
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string' } }
      }));

      vi.mocked(require('fs')).readFileSync = mockReadFileSync;

      const output = { title: 'Test Task' };
      expect(() => validateAgentOutput('po', output)).not.toThrow();
    });

    it('should throw on invalid output', () => {
      const mockReadFileSync = vi.fn().mockReturnValue(JSON.stringify({
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string' } }
      }));

      vi.mocked(require('fs')).readFileSync = mockReadFileSync;

      const output = { invalid: 'data' };
      expect(() => validateAgentOutput('po', output)).toThrow();
    });
  });

  describe('runOrchestratorStep', () => {
    it('should run orchestrator step for a task', async () => {
      const taskId = 'TR-123';
      const agentName = 'po';

      // This should execute without throwing
      await expect(runOrchestratorStep(taskId, agentName)).resolves.not.toThrow();
    });
  });
});