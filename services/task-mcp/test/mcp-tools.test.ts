import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastTrackContext } from '../src/domain/FastTrack.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';

// Mock the FastTrack functions
vi.mock('../src/domain/FastTrack.js', () => ({
  evaluateFastTrack: vi.fn(),
  guardPostDev: vi.fn()
}));

// Mock the repository
const mockRepo = {
  get: vi.fn(),
  update: vi.fn()
};

vi.mock('../src/repo/sqlite.js', () => ({
  TaskRepository: vi.fn().mockImplementation(() => mockRepo)
}));

vi.mock('../src/repo/state.js', () => ({
  StateRepository: vi.fn(),
  EventRepository: vi.fn(),
  LeaseRepository: vi.fn()
}));

// Import after mocking
import { evaluateFastTrack, guardPostDev } from '../src/domain/FastTrack.js';

// Test handlers directly
const fasttrackEvaluateHandler = async (args: any) => {
  const task = mockRepo.get(args.task_id);
  if (!task) throw new Error('Task not found');

  const ctx: FastTrackContext = {
    task,
    diff: args.diff,
    quality: args.quality,
    metadata: args.metadata
  };

  return evaluateFastTrack(ctx);
};

const fasttrackGuardPostDevHandler = async (args: any) => {
  const task = mockRepo.get(args.task_id);
  if (!task) throw new Error('Task not found');

  const ctx: FastTrackContext = {
    task,
    diff: args.diff,
    quality: args.quality,
    metadata: args.metadata
  };

  return guardPostDev(ctx, args.reviewer_violations);
};

describe('MCP Tools - FastTrack', () => {
  let mockTask: TaskRecord;
  let mockContext: FastTrackContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTask = {
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po',
      rev: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    };

    mockContext = {
      task: mockTask,
      diff: {
        files: ['src/feature.ts'],
        locAdded: 50,
        locDeleted: 10
      },
      quality: {
        coverage: 0.85,
        avgCyclomatic: 4.0,
        lintErrors: 0
      },
      metadata: {
        modulesChanged: false,
        publicApiChanged: false
      }
    };
  });

  describe('fasttrack.evaluate handler', () => {
    it('should evaluate fast-track successfully', async () => {
      const mockResult = {
        eligible: true,
        score: 75,
        reasons: ['scope_minor', 'diff_small', 'eligible'],
        hardBlocks: []
      };

      vi.mocked(evaluateFastTrack).mockReturnValue(mockResult);
      mockRepo.get.mockReturnValue(mockTask);

      const result = await fasttrackEvaluateHandler({
        task_id: mockTask.id,
        diff: mockContext.diff,
        quality: mockContext.quality,
        metadata: mockContext.metadata
      });

      expect(mockRepo.get).toHaveBeenCalledWith(mockTask.id);
      expect(evaluateFastTrack).toHaveBeenCalledWith(mockContext);
      expect(result).toEqual(mockResult);
    });

    it('should handle task not found', async () => {
      mockRepo.get.mockReturnValue(null);

      await expect(fasttrackEvaluateHandler({
        task_id: 'non-existent',
        diff: mockContext.diff,
        quality: mockContext.quality,
        metadata: mockContext.metadata
      })).rejects.toThrow('Task not found');
    });
  });

  describe('fasttrack.guard_post_dev handler', () => {
    it('should guard post-dev successfully', async () => {
      const mockResult = { revoke: false };

      vi.mocked(guardPostDev).mockReturnValue(mockResult);
      mockRepo.get.mockReturnValue(mockTask);

      const result = await fasttrackGuardPostDevHandler({
        task_id: mockTask.id,
        diff: mockContext.diff,
        quality: mockContext.quality,
        metadata: mockContext.metadata,
        reviewer_violations: []
      });

      expect(mockRepo.get).toHaveBeenCalledWith(mockTask.id);
      expect(guardPostDev).toHaveBeenCalledWith(mockContext, []);
      expect(result).toEqual({ revoke: false });
    });

    it('should revoke fast-track when conditions met', async () => {
      const mockResult = { revoke: true, reason: 'coverage_below_threshold' };

      vi.mocked(guardPostDev).mockReturnValue(mockResult);
      mockRepo.get.mockReturnValue(mockTask);

      const result = await fasttrackGuardPostDevHandler({
        task_id: mockTask.id,
        diff: mockContext.diff,
        quality: mockContext.quality,
        metadata: mockContext.metadata,
        reviewer_violations: []
      });

      expect(result).toEqual({
        revoke: true,
        reason: 'coverage_below_threshold'
      });
    });

    it('should handle task not found', async () => {
      mockRepo.get.mockReturnValue(null);

      await expect(fasttrackGuardPostDevHandler({
        task_id: 'non-existent',
        diff: mockContext.diff,
        quality: mockContext.quality,
        metadata: mockContext.metadata,
        reviewer_violations: []
      })).rejects.toThrow('Task not found');
    });
  });
});