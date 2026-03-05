import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getHealthStatus, createHealthCheckHandler, type HealthCheckDeps } from '../../src/services/health-check.js';

function createDeps(overrides?: Partial<HealthCheckDeps>): HealthCheckDeps {
  const db = new Database(':memory:');
  return {
    db,
    pluginConfig: {},
    eventLogWritable: () => true,
    ...overrides,
  };
}

describe('health-check', () => {
  let deps: HealthCheckDeps;

  beforeEach(() => {
    // Clear env vars that affect checks
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_AI_API_KEY'];
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['HEALTH_CHECK_SECRET'];
    deps = createDeps();
  });

  afterEach(() => {
    (deps.db as Database.Database).close();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_AI_API_KEY'];
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['HEALTH_CHECK_SECRET'];
  });

  describe('getHealthStatus', () => {
    it('returns degraded when LLM and Telegram are not configured', () => {
      const result = getHealthStatus(deps);
      expect(result.status).toBe('degraded');
      expect(result.checks.gateway).toBe(true);
      expect(result.checks.database).toBe(true);
      expect(result.checks.llmProvider).toBe(false);
      expect(result.checks.telegram).toBe(false);
      expect(result.checks.eventLog).toBe(true);
      expect(result.timestamp).toBeTruthy();
    });

    it('returns ok when all checks pass', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['TELEGRAM_BOT_TOKEN'] = 'test-token';
      const result = getHealthStatus(deps);
      expect(result.status).toBe('ok');
      expect(result.checks.llmProvider).toBe(true);
      expect(result.checks.telegram).toBe(true);
    });

    it('detects LLM via OPENAI_API_KEY', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test';
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(true);
    });

    it('detects LLM via GOOGLE_AI_API_KEY', () => {
      process.env['GOOGLE_AI_API_KEY'] = 'aig-test';
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(true);
    });

    it('detects LLM via pluginConfig.providers', () => {
      deps = createDeps({ pluginConfig: { providers: ['anthropic'] } });
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(true);
    });

    it('returns false for LLM when pluginConfig is undefined', () => {
      deps = createDeps({ pluginConfig: undefined });
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(false);
    });

    it('returns false for LLM when providers is empty array', () => {
      deps = createDeps({ pluginConfig: { providers: [] } });
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(false);
    });

    it('returns down when database is broken', () => {
      const closedDb = new Database(':memory:');
      closedDb.close();
      deps = createDeps({ db: closedDb });
      const result = getHealthStatus(deps);
      expect(result.status).toBe('down');
      expect(result.checks.database).toBe(false);
    });

    it('returns degraded when eventLog is not writable', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['TELEGRAM_BOT_TOKEN'] = 'test-token';
      deps = createDeps({ eventLogWritable: () => false });
      const result = getHealthStatus(deps);
      expect(result.status).toBe('degraded');
      expect(result.checks.eventLog).toBe(false);
    });

    it('handles eventLogWritable throwing', () => {
      deps = createDeps({
        eventLogWritable: () => { throw new Error('boom'); },
      });
      const result = getHealthStatus(deps);
      expect(result.checks.eventLog).toBe(false);
    });

    it('ignores whitespace-only env vars', () => {
      process.env['ANTHROPIC_API_KEY'] = '   ';
      process.env['TELEGRAM_BOT_TOKEN'] = '  ';
      const result = getHealthStatus(deps);
      expect(result.checks.llmProvider).toBe(false);
      expect(result.checks.telegram).toBe(false);
    });
  });

  describe('createHealthCheckHandler', () => {
    it('returns 200 with ok status', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['TELEGRAM_BOT_TOKEN'] = 'test-token';
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      let body = '';
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((data: string) => { body = data; }),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler({} as never, res as never);

      expect(statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith('content-type', 'application/json; charset=utf-8');
      const parsed = JSON.parse(body);
      expect(parsed.status).toBe('ok');
    });

    it('returns 503 when status is down', () => {
      const closedDb = new Database(':memory:');
      closedDb.close();
      deps = createDeps({ db: closedDb });
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler({} as never, res as never);

      expect(statusCode).toBe(503);
    });

    it('returns 401 when HEALTH_CHECK_SECRET is set and no auth header provided', () => {
      process.env['HEALTH_CHECK_SECRET'] = 'my-secret-token';
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      let body = '';
      const req = { headers: {} };
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((data: string) => { body = data; }),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler(req as never, res as never);

      expect(statusCode).toBe(401);
      const parsed = JSON.parse(body);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBe('unauthorized');
    });

    it('returns 401 when HEALTH_CHECK_SECRET is set and wrong token provided', () => {
      process.env['HEALTH_CHECK_SECRET'] = 'my-secret-token';
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      let body = '';
      const req = { headers: { authorization: 'Bearer wrong-token' } };
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((data: string) => { body = data; }),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler(req as never, res as never);

      expect(statusCode).toBe(401);
      const parsed = JSON.parse(body);
      expect(parsed.ok).toBe(false);
    });

    it('returns health status when HEALTH_CHECK_SECRET is set and correct token provided', () => {
      process.env['HEALTH_CHECK_SECRET'] = 'my-secret-token';
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['TELEGRAM_BOT_TOKEN'] = 'test-token';
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      let body = '';
      const req = { headers: { authorization: 'Bearer my-secret-token' } };
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((data: string) => { body = data; }),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler(req as never, res as never);

      expect(statusCode).toBe(200);
      const parsed = JSON.parse(body);
      expect(parsed.status).toBe('ok');
    });

    it('does not require auth when HEALTH_CHECK_SECRET is not set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      process.env['TELEGRAM_BOT_TOKEN'] = 'test-token';
      const handler = createHealthCheckHandler(deps);

      let statusCode = 0;
      let body = '';
      const req = { headers: {} };
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        end: vi.fn((data: string) => { body = data; }),
      };
      Object.defineProperty(res, 'statusCode', {
        set(v: number) { statusCode = v; },
        get() { return statusCode; },
      });

      handler(req as never, res as never);

      expect(statusCode).toBe(200);
      const parsed = JSON.parse(body);
      expect(parsed.status).toBe('ok');
    });
  });
});
