import { describe, it, expect, vi } from 'vitest';

// Mock the TaskMCPServer before importing index
vi.mock('../src/mcp/tools.ts', () => ({
  TaskMCPServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('Index', () => {
  it('should create and start the server', async () => {
    const mockServer = { start: vi.fn().mockResolvedValue(undefined) };
    const { TaskMCPServer: TaskMCPServerMock } = await import('../src/mcp/tools.ts');
    TaskMCPServerMock.mockImplementation(() => mockServer);

    // Import the index module which should create and start the server
    await import('../src/index.js');

    expect(TaskMCPServerMock).toHaveBeenCalledTimes(1);
    expect(mockServer.start).toHaveBeenCalledTimes(1);
  });
});
