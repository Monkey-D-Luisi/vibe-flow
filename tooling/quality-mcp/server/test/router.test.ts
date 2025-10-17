import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolName } from '../src/toolNames.js';

process.env.QUALITY_MCP_KEYS = 'test:run';
process.env.QUALITY_RPS = '100';
process.env.QUALITY_BURST = '100';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const mockResults: Record<ToolName, any> = {
  'quality.run_tests': {
    total: 183,
    passed: 183,
    failed: 0,
    durationMs: 5600
  },
  'quality.coverage_report': {
    total: { lines: 0.83 },
    lines: 0.83
  },
  'quality.lint': {
    errors: 0,
    warnings: 2,
    summary: { errors: 0, warnings: 2 }
  },
  'quality.complexity': {
    maxCyclomatic: 7,
    avgCyclomatic: 2.6,
    metrics: { max: 7, avg: 2.6 }
  }
};

const mockInvokeTool = vi.fn(async (tool: ToolName) => clone(mockResults[tool]));

vi.mock('../src/exec.js', () => ({
  invokeTool: (tool: ToolName) => mockInvokeTool(tool)
}));

async function buildServer() {
  const { registerRoutes } = await import('../src/router.ts');
  const app = Fastify();
  await registerRoutes(app);
  return app;
}

afterEach(() => {
  mockInvokeTool.mockClear();
});

describe('POST /mcp/tool', () => {
  it('returns schema-compliant payloads for all quality tools', async () => {
    const app = await buildServer();
    try {
      for (const tool of Object.keys(mockResults) as ToolName[]) {
        const response = await app.inject({
          method: 'POST',
          url: '/mcp/tool',
          payload: { tool, input: {} },
          headers: { Authorization: 'Bearer test' }
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.ok).toBe(true);
        expect(body.tool).toBe(tool);
        expect(typeof body.requestId).toBe('string');
        expect(body.result).toEqual(mockResults[tool]);
      }
    } finally {
      await app.close();
    }
  });

  it('returns 422 with validation details on malformed runner payload', async () => {
    mockInvokeTool.mockResolvedValueOnce({});
    const app = await buildServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/mcp/tool',
        payload: { tool: 'quality.run_tests', input: {} },
        headers: { Authorization: 'Bearer test' }
      });
      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.payload);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('RUNNER_ERROR');
      expect(body.error.message).toContain('Runner output failed validation');
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('keeps streaming and non-streaming results consistent and propagates requestId', async () => {
    const expected = clone(mockResults['quality.coverage_report']);
    mockInvokeTool.mockImplementation(async () => clone(expected));
    const app = await buildServer();
    try {
      const streamResponse = await app.inject({
        method: 'POST',
        url: '/mcp/tool/stream',
        payload: { tool: 'quality.coverage_report', input: {} },
        headers: { Authorization: 'Bearer test' }
      });

      const events = streamResponse.payload
        .trim()
        .split('\n\n')
        .map((block) => {
          const lines = block.split('\n');
          const eventLine = lines.find((line) => line.startsWith('event:'));
          const dataLine = lines.find((line) => line.startsWith('data:'));
          let parsedData: unknown;
          if (dataLine) {
            const raw = dataLine.slice('data:'.length);
            try {
              parsedData = JSON.parse(raw);
            } catch {
              parsedData = undefined;
            }
          }
          return {
            event: eventLine ? eventLine.slice('event:'.length).trim() : undefined,
            data: parsedData
          };
        });

      const resultEvent = events.find((entry) => entry.event === 'result');
      expect(resultEvent?.data).toBeDefined();
      expect(resultEvent?.data?.result).toEqual(expected);
      const streamRequestId = resultEvent?.data?.requestId;
      expect(typeof streamRequestId).toBe('string');

      const completedLog = events.find(
        (entry) => entry.event === 'log' && entry.data?.msg === 'Tool execution completed'
      );
      expect(completedLog?.data?.requestId).toBe(streamRequestId);

      const syncResponse = await app.inject({
        method: 'POST',
        url: '/mcp/tool',
        payload: { tool: 'quality.coverage_report', input: {} },
        headers: { Authorization: 'Bearer test' }
      });
      expect(syncResponse.statusCode).toBe(200);
      const syncBody = JSON.parse(syncResponse.payload);
      expect(syncBody.result).toEqual(expected);
    } finally {
      await app.close();
    }
  });
});
