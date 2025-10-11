import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the TaskMCPServer to avoid actual server startup in tests
vi.mock('../src/mcp/tools.js', () => ({
  TaskMCPServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('Index', () => {
  let mockConsoleError: any;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  it('should start the server successfully', async () => {
    // Import after mocking to ensure the mock is used
    const { TaskMCPServer } = await import('../src/mcp/tools.js');
    const mockServer = new TaskMCPServer();

    // Re-import index to trigger the server startup
    await import('../src/index.js');

    expect(mockServer.start).toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should handle server startup errors', async () => {
    const { TaskMCPServer } = await import('../src/mcp/tools.js');
    const mockServer = new TaskMCPServer();
    const testError = new Error('Server startup failed');

    // Mock the start method to throw an error
    mockServer.start.mockRejectedValueOnce(testError);

    // Re-import index to trigger the server startup with error
    await import('../src/index.js');

    expect(mockServer.start).toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(testError);
  });
});