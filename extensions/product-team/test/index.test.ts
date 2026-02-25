import { describe, it, expect, vi, afterEach } from 'vitest';
import { register } from '../src/index.js';
import type { OpenClawPluginApi } from '../src/index.js';

function createMockApi(options?: {
  pluginConfig?: Record<string, unknown>;
  resolvePath?: (path: string) => string;
}): OpenClawPluginApi {
  return {
    id: 'product-team',
    name: 'Product Team Engine',
    source: 'config',
    config: {} as OpenClawPluginApi['config'],
    pluginConfig: options?.pluginConfig ?? { dbPath: ':memory:' },
    runtime: {} as OpenClawPluginApi['runtime'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerHttpHandler: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerProvider: vi.fn(),
    registerCommand: vi.fn(),
    resolvePath: vi.fn(options?.resolvePath ?? ((p: string) => p)),
    on: vi.fn(),
  };
}

describe('product-team plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports a register function', () => {
    expect(typeof register).toBe('function');
  });

  it('register runs without error with a mock API', () => {
    const api = createMockApi();
    expect(() => register(api)).not.toThrow();
  });

  it('logs a message on load', () => {
    const api = createMockApi();
    register(api);
    expect(api.logger.info).toHaveBeenCalledWith('product-team plugin loaded');
  });

  it('registers exactly 17 task/workflow/quality/vcs tools', () => {
    const api = createMockApi();
    register(api);
    expect(api.registerTool).toHaveBeenCalledTimes(17);
  });

  it('registers tools with expected names', () => {
    const api = createMockApi();
    register(api);

    const calls = (api.registerTool as ReturnType<typeof vi.fn>).mock.calls;
    const toolNames = calls.map(
      (call: unknown[]) => (call[0] as { name: string }).name,
    );

    expect(toolNames).toContain('task.create');
    expect(toolNames).toContain('task.get');
    expect(toolNames).toContain('task.search');
    expect(toolNames).toContain('task.update');
    expect(toolNames).toContain('task.transition');
    expect(toolNames).toContain('workflow.step.run');
    expect(toolNames).toContain('workflow.state.get');
    expect(toolNames).toContain('workflow.events.query');
    expect(toolNames).toContain('quality.tests');
    expect(toolNames).toContain('quality.coverage');
    expect(toolNames).toContain('quality.lint');
    expect(toolNames).toContain('quality.complexity');
    expect(toolNames).toContain('quality.gate');
    expect(toolNames).toContain('vcs.branch.create');
    expect(toolNames).toContain('vcs.pr.create');
    expect(toolNames).toContain('vcs.pr.update');
    expect(toolNames).toContain('vcs.label.sync');
  });

  it('logs tool registration count', () => {
    const api = createMockApi();
    register(api);
    expect(api.logger.info).toHaveBeenCalledWith(
      'registered 17 task/workflow/quality/vcs tools',
    );
  });

  it('registers PR-Bot after_tool_call hook by default', () => {
    const api = createMockApi();
    register(api);

    expect(api.on).toHaveBeenCalledWith(
      'after_tool_call',
      expect.any(Function),
    );
    expect(api.logger.info).toHaveBeenCalledWith(
      'registered PR-Bot after_tool_call hook',
    );
  });

  it('does not register PR-Bot hook when disabled in config', () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          prBot: {
            enabled: false,
          },
        },
      },
    });

    register(api);

    const hookCalls = (api.on as ReturnType<typeof vi.fn>).mock.calls;
    expect(hookCalls.some((call: unknown[]) => call[0] === 'after_tool_call')).toBe(false);
  });

  it('defaults dbPath to :memory: when plugin config dbPath is not a string', () => {
    const api = createMockApi({
      pluginConfig: { dbPath: 123 },
    });
    register(api);
    expect(api.resolvePath).toHaveBeenCalledWith(':memory:');
  });

  it('rejects database paths that escape the workspace root', () => {
    const api = createMockApi({
      pluginConfig: { dbPath: '..\\outside.db' },
      resolvePath: (value) => {
        if (value === '.') {
          return 'C:\\workspace\\repo';
        }
        if (value === '..\\outside.db') {
          return 'C:\\workspace\\outside.db';
        }
        return value;
      },
    });

    expect(() => register(api)).toThrow(/escapes workspace root/);
  });

  it('executes registered shutdown handlers and closes the database', () => {
    const handlers: Partial<Record<'exit' | 'SIGINT' | 'SIGTERM', () => void>> = {};
    vi.spyOn(process, 'once').mockImplementation(
      ((event: string, handler: () => void) => {
        if (event === 'exit' || event === 'SIGINT' || event === 'SIGTERM') {
          handlers[event] = handler;
        }
        return process;
      }) as unknown as typeof process.once,
    );

    const api = createMockApi();
    register(api);

    expect(handlers.exit).toBeTypeOf('function');
    expect(handlers.SIGINT).toBeTypeOf('function');
    expect(handlers.SIGTERM).toBeTypeOf('function');

    handlers.exit?.();
    handlers.SIGINT?.();
    handlers.SIGTERM?.();

    expect(api.logger.info).toHaveBeenCalledWith('database closed');
  });

  it('can execute a registered task.create tool', async () => {
    const api = createMockApi();
    register(api);

    const calls = (api.registerTool as ReturnType<typeof vi.fn>).mock.calls;
    const createTool = calls
      .map((call: unknown[]) => call[0] as { name: string; execute: (toolCallId: string, params: unknown) => Promise<{ details: unknown }> })
      .find((tool) => tool.name === 'task.create');
    expect(createTool).toBeDefined();

    const result = await createTool!.execute('c1', { title: 'Created from plugin test' });
    const details = result.details as { task: { title: string; rev: number } };
    expect(details.task.title).toBe('Created from plugin test');
    expect(details.task.rev).toBe(0);
  });
});
