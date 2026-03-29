export type TemplateType = 'tool' | 'hook' | 'service' | 'http' | 'hybrid';

export const VALID_TEMPLATES: readonly TemplateType[] = ['tool', 'hook', 'service', 'http', 'hybrid'] as const;

export function isValidTemplate(value: string): value is TemplateType {
  return (VALID_TEMPLATES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// src/index.ts renderers
// ---------------------------------------------------------------------------

export function renderSrcIndex(name: string, template: TemplateType): string {
  switch (template) {
    case 'tool':
      return renderToolIndex(name);
    case 'hook':
      return renderHookIndex(name);
    case 'service':
      return renderServiceIndex(name);
    case 'http':
      return renderHttpIndex(name);
    case 'hybrid':
      return renderHybridIndex(name);
  }
}

function renderToolIndex(name: string): string {
  return `export default {
  id: '${name}',
  name: '${name}',
  description: 'OpenClaw extension: ${name}',

  register(api: { registerTool: (tool: unknown) => void; logger: { info: (msg: string) => void } }): void {
    api.registerTool({
      name: '${name.replace(/-/g, '_')}_hello',
      label: 'Hello',
      description: 'Return a greeting',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const greetName = String(params['name'] ?? 'World');
        return {
          content: [{ type: 'text' as const, text: \`Hello, \${greetName}!\` }],
        };
      },
    });

    api.logger.info('${name} extension loaded');
  },
};
`;
}

function renderHookIndex(name: string): string {
  return `export default {
  id: '${name}',
  name: '${name}',
  description: 'OpenClaw extension: ${name}',

  register(api: { on: (event: string, handler: (...args: unknown[]) => void) => void; logger: { info: (msg: string) => void } }): void {
    api.on('after_tool_call', (event: unknown) => {
      const ev = event as Record<string, unknown>;
      const toolName = String(ev['toolName'] ?? 'unknown');
      api.logger.info(\`Tool completed: \${toolName}\`);
    });

    api.logger.info('${name} extension loaded');
  },
};
`;
}

function renderServiceIndex(name: string): string {
  return `export default {
  id: '${name}',
  name: '${name}',
  description: 'OpenClaw extension: ${name}',

  register(api: { registerService: (svc: { id: string; start: () => Promise<void>; stop: () => Promise<void> }) => void; logger: { info: (msg: string) => void; error: (msg: string) => void } }): void {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    api.registerService({
      id: '${name}-worker',
      async start() {
        api.logger.info('${name} service started');
        intervalId = setInterval(() => {
          api.logger.info('${name} heartbeat');
        }, 60_000);
      },
      async stop() {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        api.logger.info('${name} service stopped');
      },
    });

    api.logger.info('${name} extension loaded');
  },
};
`;
}

function renderHttpIndex(name: string): string {
  return `import type { IncomingMessage, ServerResponse } from 'node:http';

export default {
  id: '${name}',
  name: '${name}',
  description: 'OpenClaw extension: ${name}',

  register(api: { registerHttpRoute: (config: { path: string; auth: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => void; logger: { info: (msg: string) => void } }): void {
    api.registerHttpRoute({
      path: '/api/${name}',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const data = { status: 'ok', timestamp: new Date().toISOString() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
    });

    api.logger.info('${name} extension loaded');
  },
};
`;
}

function renderHybridIndex(name: string): string {
  return `import type { IncomingMessage, ServerResponse } from 'node:http';

export default {
  id: '${name}',
  name: '${name}',
  description: 'OpenClaw extension: ${name}',

  register(api: {
    registerTool: (tool: unknown) => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    registerHttpRoute: (config: { path: string; auth: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => void;
    logger: { info: (msg: string) => void };
  }): void {
    // --- Tool ---
    api.registerTool({
      name: '${name.replace(/-/g, '_')}_hello',
      label: 'Hello',
      description: 'Return a greeting',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const greetName = String(params['name'] ?? 'World');
        return {
          content: [{ type: 'text' as const, text: \`Hello, \${greetName}!\` }],
        };
      },
    });

    // --- Hook ---
    api.on('after_tool_call', (event: unknown) => {
      const ev = event as Record<string, unknown>;
      const toolName = String(ev['toolName'] ?? 'unknown');
      api.logger.info(\`Tool completed: \${toolName}\`);
    });

    // --- HTTP Route ---
    api.registerHttpRoute({
      path: '/api/${name}',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const data = { status: 'ok', timestamp: new Date().toISOString() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      },
    });

    api.logger.info('${name} extension loaded');
  },
};
`;
}

// ---------------------------------------------------------------------------
// test/index.test.ts renderers
// ---------------------------------------------------------------------------

export function renderTestIndex(name: string, template: TemplateType): string {
  switch (template) {
    case 'tool':
      return renderToolTest(name);
    case 'hook':
      return renderHookTest(name);
    case 'service':
      return renderServiceTest(name);
    case 'http':
      return renderHttpTest(name);
    case 'hybrid':
      return renderHybridTest(name);
  }
}

function renderToolTest(name: string): string {
  return `import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  function createMockApi() {
    return {
      registerTool: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  it('has the correct id', () => {
    expect(plugin.id).toBe('${name}');
  });

  it('registers a tool', () => {
    const api = createMockApi();
    plugin.register(api);
    expect(api.registerTool).toHaveBeenCalledOnce();
  });

  it('tool returns a greeting', async () => {
    const api = createMockApi();
    plugin.register(api);

    const tool = api.registerTool.mock.calls[0][0] as {
      execute: (id: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
    };
    const result = await tool.execute('test', { name: 'Alice' });

    expect(result.content[0].text).toBe('Hello, Alice!');
  });
});
`;
}

function renderHookTest(name: string): string {
  return `import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  function createMockApi() {
    return {
      on: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  it('has the correct id', () => {
    expect(plugin.id).toBe('${name}');
  });

  it('registers an after_tool_call hook', () => {
    const api = createMockApi();
    plugin.register(api);

    expect(api.on).toHaveBeenCalledWith('after_tool_call', expect.any(Function));
  });

  it('hook logs the tool name', () => {
    const api = createMockApi();
    plugin.register(api);

    const handler = api.on.mock.calls[0][1] as (event: unknown) => void;
    handler({ toolName: 'test_tool' });

    expect(api.logger.info).toHaveBeenCalledWith('Tool completed: test_tool');
  });
});
`;
}

function renderServiceTest(name: string): string {
  return `import { describe, it, expect, vi, afterEach } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  function createMockApi() {
    return {
      registerService: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct id', () => {
    expect(plugin.id).toBe('${name}');
  });

  it('registers a service', () => {
    const api = createMockApi();
    plugin.register(api);
    expect(api.registerService).toHaveBeenCalledOnce();
  });

  it('service can start and stop', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    plugin.register(api);

    const svc = api.registerService.mock.calls[0][0] as {
      start: () => Promise<void>;
      stop: () => Promise<void>;
    };

    await svc.start();
    expect(api.logger.info).toHaveBeenCalledWith('${name} service started');

    await svc.stop();
    expect(api.logger.info).toHaveBeenCalledWith('${name} service stopped');
    vi.useRealTimers();
  });
});
`;
}

function renderHttpTest(name: string): string {
  return `import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  function createMockApi() {
    return {
      registerHttpRoute: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  it('has the correct id', () => {
    expect(plugin.id).toBe('${name}');
  });

  it('registers an HTTP route', () => {
    const api = createMockApi();
    plugin.register(api);
    expect(api.registerHttpRoute).toHaveBeenCalledOnce();

    const route = api.registerHttpRoute.mock.calls[0][0] as { path: string; auth: string };
    expect(route.path).toBe('/api/${name}');
    expect(route.auth).toBe('plugin');
  });
});
`;
}

function renderHybridTest(name: string): string {
  return `import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

describe('${name} plugin', () => {
  function createMockApi() {
    return {
      registerTool: vi.fn(),
      on: vi.fn(),
      registerHttpRoute: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  }

  it('has the correct id', () => {
    expect(plugin.id).toBe('${name}');
  });

  it('registers a tool, a hook, and an HTTP route', () => {
    const api = createMockApi();
    plugin.register(api);

    expect(api.registerTool).toHaveBeenCalledOnce();
    expect(api.on).toHaveBeenCalledWith('after_tool_call', expect.any(Function));
    expect(api.registerHttpRoute).toHaveBeenCalledOnce();
  });

  it('tool returns a greeting', async () => {
    const api = createMockApi();
    plugin.register(api);

    const tool = api.registerTool.mock.calls[0][0] as {
      execute: (id: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
    };
    const result = await tool.execute('test', { name: 'Alice' });

    expect(result.content[0].text).toBe('Hello, Alice!');
  });
});
`;
}
