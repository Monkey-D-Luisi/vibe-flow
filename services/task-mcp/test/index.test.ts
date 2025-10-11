import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the TaskMCPServer to avoid actual server startup in tests
const mockStart = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/mcp/tools.ts', () => ({
  TaskMCPServer: vi.fn().mockImplementation(() => ({
    start: mockStart
  }))
}));

describe('Index', () => {
  let mockConsoleError: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  it('should start the server successfully', async () => {
    // Import after mocking to ensure the mock is used
    const { TaskMCPServer } = await import('../src/mcp/tools.ts');
    const mockServer = new TaskMCPServer();

    // Re-import index to trigger the server startup
    await import('../src/index.js');

    expect(mockStart).toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should handle server startup errors', async () => {
    const testError = new Error('Server startup failed');

    // Mock the start method to throw an error
    mockStart.mockRejectedValueOnce(testError);

    // Re-import index to trigger the server startup with error
    await import('../src/index.js');

    expect(mockStart).toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(testError);
  });
});
