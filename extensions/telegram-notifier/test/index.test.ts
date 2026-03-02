import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

type CommandHandler = (ctx: { args?: string }) => Promise<{ text: string }>;

interface RegisteredCommand {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  handler: CommandHandler;
}

function createMockApi(config: Record<string, unknown> = {}) {
  const commands: RegisteredCommand[] = [];
  const hooks: Record<string, ((...args: unknown[]) => void)[]> = {};

  return {
    api: {
      pluginConfig: {
        groupId: '-100123456',
        rateLimit: { maxPerMinute: 20 },
        ...config,
      },
      runtime: {} as Record<string, unknown>,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        hooks[event] ??= [];
        hooks[event]!.push(handler);
      }),
      registerCommand: vi.fn((cmd: RegisteredCommand) => {
        commands.push(cmd);
      }),
      registerService: vi.fn(),
      registerTool: vi.fn(),
    },
    commands,
    hooks,
  };
}

describe('Telegram Notifier plugin', () => {
  it('has the expected plugin metadata', () => {
    expect(plugin.id).toBe('telegram-notifier');
    expect(plugin.name).toBe('Telegram Team Notifier');
    expect(typeof plugin.register).toBe('function');
  });

  it('registers lifecycle hooks when groupId is configured', () => {
    const { api, hooks } = createMockApi();
    plugin.register(api as never);

    expect(Object.keys(hooks)).toContain('after_tool_call');
    expect(Object.keys(hooks)).toContain('agent_end');
    expect(Object.keys(hooks)).toContain('subagent_spawned');
  });

  it('registers slash commands when groupId is configured', () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);

    const names = commands.map((c) => c.name);
    expect(names).toContain('teamstatus');
    expect(names).toContain('idea');
    expect(names).toContain('health');
    expect(names).toContain('budget');
  });

  it('warns and returns early when groupId is missing', () => {
    const { api, commands } = createMockApi({ groupId: '' });
    plugin.register(api as never);

    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No groupId configured'),
    );
    expect(commands.length).toBe(0);
  });

  it('registers the background message queue service', () => {
    const { api } = createMockApi();
    plugin.register(api as never);

    expect(api.registerService).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'telegram-notifier-queue' }),
    );
  });
});

describe('Telegram Notifier command handlers', () => {
  function getHandler(commands: RegisteredCommand[], name: string): CommandHandler {
    const cmd = commands.find((c) => c.name === name);
    if (!cmd) throw new Error(`Command "${name}" not registered`);
    return cmd.handler;
  }

  it('/teamstatus returns placeholder text', async () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);
    const result = await getHandler(commands, 'teamstatus')({});
    expect(result.text).toContain('Status');
  });

  it('/health returns running confirmation', async () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);
    const result = await getHandler(commands, 'health')({});
    expect(result.text).toContain('Gateway is running');
  });

  it('/budget returns placeholder text', async () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);
    const result = await getHandler(commands, 'budget')({});
    expect(result.text).toContain('Budget');
  });

  it('/idea with text acknowledges the idea', async () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);
    const result = await getHandler(commands, 'idea')({ args: 'Add dark mode' });
    expect(result.text).toContain('Add dark mode');
    expect(result.text).toContain('PM agent');
  });

  it('/idea without text returns usage hint', async () => {
    const { api, commands } = createMockApi();
    plugin.register(api as never);
    const result = await getHandler(commands, 'idea')({ args: '' });
    expect(result.text).toContain('Usage:');
  });
});
