import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
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

function getCiRoute(api: OpenClawPluginApi): {
  path: string;
  handler: (req: unknown, res: unknown) => Promise<void>;
} | null {
  const calls = (api.registerHttpRoute as ReturnType<typeof vi.fn>).mock.calls;
  if (calls.length === 0) {
    return null;
  }
  const route = calls[0]?.[0] as {
    path: string;
    handler: (req: unknown, res: unknown) => Promise<void>;
  } | undefined;
  return route ?? null;
}

function createWebhookRequest(options?: {
  method?: string;
  headers?: Record<string, string | undefined>;
  chunks?: string[];
}): {
  method: string;
  headers: Record<string, string | undefined>;
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;
} {
  const chunks = options?.chunks ?? [];
  return {
    method: options?.method ?? 'POST',
    headers: options?.headers ?? { 'x-github-event': 'check_run' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createWebhookResponse(): {
  statusCode: number;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

function buildGithubSignature(secret: string, payload: string): string {
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

type RegisteredTool = {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
  ) => Promise<{ details: unknown }>;
};

function getRegisteredTool(api: OpenClawPluginApi, name: string): RegisteredTool {
  const calls = (api.registerTool as ReturnType<typeof vi.fn>).mock.calls;
  const tool = calls
    .map((call: unknown[]) => call[0] as RegisteredTool)
    .find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Tool '${name}' is not registered`);
  }
  return tool;
}

async function createTask(api: OpenClawPluginApi, title: string): Promise<string> {
  const createTool = getRegisteredTool(api, 'task.create');
  const result = await createTool.execute('create-task', { title });
  const details = result.details as { task: { id: string } };
  return details.task.id;
}

async function getTaskMetadata(
  api: OpenClawPluginApi,
  taskId: string,
): Promise<Record<string, unknown>> {
  const getTool = getRegisteredTool(api, 'task.get');
  const result = await getTool.execute('get-task', { id: taskId });
  const details = result.details as { task: { metadata: Record<string, unknown> } };
  return details.task.metadata;
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

  it('does not register CI webhook route by default', () => {
    const api = createMockApi();
    register(api);

    expect(api.registerHttpRoute).not.toHaveBeenCalled();
  });

  it('registers CI webhook route when enabled in config', () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: 'test-secret',
          },
        },
      },
    });
    register(api);

    expect(api.registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/webhooks/github/ci',
        handler: expect.any(Function),
      }),
    );
    expect(api.logger.info).toHaveBeenCalledWith('registered CI webhook route at /webhooks/github/ci');
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

  it('does not register CI webhook route when disabled in config', () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          ciFeedback: {
            enabled: false,
          },
        },
      },
    });

    register(api);
    expect(api.registerHttpRoute).not.toHaveBeenCalled();
  });

  it('returns 413 when webhook payload exceeds max size', async () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: 'test-secret',
          },
        },
      },
    });
    register(api);

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const req = createWebhookRequest({
      headers: { 'x-github-event': 'check_run' },
      chunks: ['x'.repeat(1_000_001)],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(413);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"payload_too_large"'));
  });

  it('returns 400 when webhook payload is invalid JSON', async () => {
    const secret = 'test-secret';
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: secret,
          },
        },
      },
    });
    register(api);

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const rawPayload = '{not-json';
    const req = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': buildGithubSignature(secret, rawPayload),
      },
      chunks: [rawPayload],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(400);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"invalid_json_payload"'));
  });

  it('returns 401 when webhook signature header is missing', async () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: 'test-secret',
          },
        },
      },
    });
    register(api);

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const req = createWebhookRequest({
      headers: { 'x-github-event': 'check_run' },
      chunks: ['{}'],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(401);
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining('"missing_x_hub_signature_256_header"'),
    );
  });

  it('returns 401 when webhook signature is invalid', async () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: 'test-secret',
          },
        },
      },
    });
    register(api);

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const req = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': 'sha256=deadbeef',
      },
      chunks: ['{}'],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(401);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"invalid_x_hub_signature_256"'));
  });

  it('accepts valid webhook signature and applies CI metadata side effects', async () => {
    const secret = 'test-secret';
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: secret,
            commentOnPr: false,
          },
        },
      },
    });
    register(api);
    const taskId = await createTask(api, 'CI signature happy path');

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const payload = JSON.stringify({
      action: 'completed',
      repository: { full_name: 'acme/vibe-flow' },
      check_run: {
        name: 'CI / lint',
        status: 'completed',
        conclusion: 'success',
        pull_requests: [{ number: 42 }],
        check_suite: { head_branch: `task/${taskId}-ci` },
      },
    });
    const req = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': buildGithubSignature(secret, payload),
      },
      chunks: [payload],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"handled":true'));

    const metadata = await getTaskMetadata(api, taskId);
    expect(metadata).toHaveProperty('ci');
  });

  it('does not apply CI metadata side effects when webhook signature is invalid', async () => {
    const secret = 'test-secret';
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: secret,
            commentOnPr: false,
          },
        },
      },
    });
    register(api);
    const taskId = await createTask(api, 'CI invalid signature side effects');

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const payload = JSON.stringify({
      action: 'completed',
      repository: { full_name: 'acme/vibe-flow' },
      check_run: {
        name: 'CI / test',
        status: 'completed',
        conclusion: 'success',
        pull_requests: [{ number: 52 }],
        check_suite: { head_branch: `task/${taskId}-ci` },
      },
    });

    const invalidReq = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': 'sha256=deadbeef',
      },
      chunks: [payload],
    });
    const invalidRes = createWebhookResponse();

    await route!.handler(invalidReq as unknown, invalidRes as unknown);

    expect(invalidRes.statusCode).toBe(401);
    expect(invalidRes.end).toHaveBeenCalledWith(
      expect.stringContaining('"invalid_x_hub_signature_256"'),
    );
    expect(await getTaskMetadata(api, taskId)).toEqual({});

    const validReq = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': buildGithubSignature(secret, payload),
      },
      chunks: [payload],
    });
    const validRes = createWebhookResponse();

    await route!.handler(validReq as unknown, validRes as unknown);

    expect(validRes.statusCode).toBe(200);
    expect(validRes.end).toHaveBeenCalledWith(expect.stringContaining('"handled":true'));
    expect(await getTaskMetadata(api, taskId)).toHaveProperty('ci');
  });

  it('uses webhook secret verbatim without trimming whitespace', async () => {
    const secret = '  test-secret-with-spaces  ';
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          owner: 'acme',
          repo: 'vibe-flow',
          ciFeedback: {
            enabled: true,
            webhookSecret: secret,
            commentOnPr: false,
          },
        },
      },
    });
    register(api);
    const taskId = await createTask(api, 'CI whitespace secret');

    const route = getCiRoute(api);
    expect(route).not.toBeNull();

    const payload = JSON.stringify({
      action: 'completed',
      repository: { full_name: 'acme/vibe-flow' },
      check_run: {
        name: 'CI / coverage',
        status: 'completed',
        conclusion: 'success',
        pull_requests: [{ number: 63 }],
        check_suite: { head_branch: `task/${taskId}-ci` },
      },
    });
    const req = createWebhookRequest({
      headers: {
        'x-github-event': 'check_run',
        'x-hub-signature-256': buildGithubSignature(secret, payload),
      },
      chunks: [payload],
    });
    const res = createWebhookResponse();

    await route!.handler(req as unknown, res as unknown);

    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('"handled":true'));
  });

  it('throws when CI feedback is enabled without webhook secret', () => {
    const api = createMockApi({
      pluginConfig: {
        dbPath: ':memory:',
        github: {
          ciFeedback: {
            enabled: true,
          },
        },
      },
    });

    expect(() => register(api)).toThrow(/webhookSecret must be configured/);
  });

  it('swallows unexpected errors from PR-Bot hook callback', async () => {
    const api = createMockApi();
    register(api);

    const hookCalls = (api.on as ReturnType<typeof vi.fn>).mock.calls;
    const afterToolCallHook = hookCalls
      .find((call: unknown[]) => call[0] === 'after_tool_call')?.[1] as
      | ((event: unknown, ctx: unknown) => Promise<void>)
      | undefined;

    expect(afterToolCallHook).toBeDefined();
    await expect(afterToolCallHook!(null, {})).resolves.toBeUndefined();
    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('pr-bot after_tool_call hook failed:'),
    );
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
