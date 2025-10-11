import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies
vi.mock('../src/repo/sqlite.js', () => ({
  TaskRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    search: vi.fn(),
    database: {}
  }))
}));

vi.mock('../src/repo/state.js', () => ({
  StateRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  })),
  EventRepository: vi.fn().mockImplementation(() => ({
    append: vi.fn(),
    getByTaskId: vi.fn()
  })),
  LeaseRepository: vi.fn().mockImplementation(() => ({
    acquire: vi.fn(),
    release: vi.fn()
  }))
}));

vi.mock('../src/domain/TaskRecord.js', () => ({
  TaskRecordValidator: {
    validateCreation: vi.fn(),
    validateTransition: vi.fn()
  }
}));

vi.mock('../src/domain/FastTrack.js', () => ({
  evaluateFastTrack: vi.fn(),
  guardPostDev: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn()
}));

describe('TaskMCPServer', () => {
  let mockServer: any;
  let mockTaskRepo: any;
  let mockStateRepo: any;
  let mockEventRepo: any;
  let mockLeaseRepo: any;
  let mockValidator: any;
  let mockFastTrack: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get mock instances
    const { TaskRepository } = require('../src/repo/sqlite.js');
    const { StateRepository, EventRepository, LeaseRepository } = require('../src/repo/state.js');
    const { TaskRecordValidator } = require('../src/domain/TaskRecord.js');
    const { evaluateFastTrack, guardPostDev } = require('../src/domain/FastTrack.js');
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

    mockTaskRepo = new TaskRepository();
    mockStateRepo = new StateRepository();
    mockEventRepo = new EventRepository();
    mockLeaseRepo = new LeaseRepository();
    mockValidator = TaskRecordValidator;
    mockFastTrack = { evaluateFastTrack, guardPostDev };
    mockServer = new Server();
  });

  describe('initialization', () => {
    it('should create server with correct configuration', async () => {
      const { TaskMCPServer } = await import('../src/mcp/tools.js');
      const server = new TaskMCPServer();

      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    it('should start server successfully', async () => {
      const { TaskMCPServer } = await import('../src/mcp/tools.js');
      const server = new TaskMCPServer();

      await server.start();

      expect(mockServer.connect).toHaveBeenCalled();
    });
  });

  describe('tool handlers', () => {
    let server: any;
    let callHandler: any;

    beforeEach(async () => {
      const { TaskMCPServer } = await import('../src/mcp/tools.js');
      server = new TaskMCPServer();

      // Get the call tool handler
      const callHandlerCall = mockServer.setRequestHandler.mock.calls.find(
        (call: any) => call[0].method === 'tools/call'
      );
      callHandler = callHandlerCall[1];
    });

    describe('task.create', () => {
      it('should create task successfully', async () => {
        mockValidator.validateCreation.mockReturnValue({ valid: true, errors: [] });
        mockTaskRepo.create.mockReturnValue({ id: 'TR-123', title: 'Test task' });

        const result = await callHandler({
          params: {
            name: 'task.create',
            arguments: {
              title: 'Test task',
              acceptance_criteria: ['Test criteria'],
              scope: 'minor'
            }
          }
        });

        expect(mockValidator.validateCreation).toHaveBeenCalled();
        expect(mockTaskRepo.create).toHaveBeenCalled();
        expect(result.content[0].text).toContain('TR-123');
        expect(result.isError).toBeUndefined();
      });

      it('should reject invalid task creation', async () => {
        mockValidator.validateCreation.mockReturnValue({
          valid: false,
          errors: ['Title required']
        });

        const result = await callHandler({
          params: {
            name: 'task.create',
            arguments: {
              title: '',
              acceptance_criteria: [],
              scope: 'invalid'
            }
          }
        });

        expect(result.content[0].text).toContain('Validation failed');
        expect(result.isError).toBe(true);
      });
    });

    describe('task.get', () => {
      it('should get task successfully', async () => {
        mockTaskRepo.get.mockReturnValue({ id: 'TR-123', title: 'Test task' });

        const result = await callHandler({
          params: {
            name: 'task.get',
            arguments: { id: 'TR-123' }
          }
        });

        expect(mockTaskRepo.get).toHaveBeenCalledWith('TR-123');
        expect(result.content[0].text).toContain('TR-123');
      });

      it('should handle task not found', async () => {
        mockTaskRepo.get.mockReturnValue(null);

        const result = await callHandler({
          params: {
            name: 'task.get',
            arguments: { id: 'TR-999' }
          }
        });

        expect(result.content[0].text).toContain('Task not found');
        expect(result.isError).toBe(true);
      });
    });

    describe('fasttrack.evaluate', () => {
      it('should evaluate fast-track successfully', async () => {
        mockTaskRepo.get.mockReturnValue({ id: 'TR-123', title: 'Test task' });
        mockFastTrack.evaluateFastTrack.mockReturnValue({
          eligible: true,
          score: 85,
          reasons: ['scope_minor'],
          hardBlocks: []
        });

        const result = await callHandler({
          params: {
            name: 'fasttrack.evaluate',
            arguments: {
              task_id: 'TR-123',
              diff: { files: [], locAdded: 10, locDeleted: 0 },
              quality: { lintErrors: 0 },
              metadata: { modulesChanged: false, publicApiChanged: false }
            }
          }
        });

        expect(mockTaskRepo.get).toHaveBeenCalledWith('TR-123');
        expect(mockFastTrack.evaluateFastTrack).toHaveBeenCalled();
        expect(result.content[0].text).toContain('eligible');
      });

      it('should handle task not found for fast-track evaluation', async () => {
        mockTaskRepo.get.mockReturnValue(null);

        const result = await callHandler({
          params: {
            name: 'fasttrack.evaluate',
            arguments: {
              task_id: 'TR-999',
              diff: { files: [], locAdded: 10, locDeleted: 0 },
              quality: { lintErrors: 0 },
              metadata: { modulesChanged: false, publicApiChanged: false }
            }
          }
        });

        expect(result.content[0].text).toContain('Task not found');
        expect(result.isError).toBe(true);
      });
    });

    describe('unknown tool', () => {
      it('should handle unknown tool', async () => {
        const result = await callHandler({
          params: {
            name: 'unknown.tool',
            arguments: {}
          }
        });

        expect(result.content[0].text).toContain('Unknown tool');
        expect(result.isError).toBe(true);
      });
    });
  });
});