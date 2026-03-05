import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitoringCron, type MonitoringCronDeps } from '../../src/services/monitoring-cron.js';
import * as healthCheckModule from '../../src/services/health-check.js';
import * as costSummaryModule from '../../src/cost/cost-summary.js';
import type { HealthCheckResult } from '../../src/services/health-check.js';
import type { EventQueryResult } from '../../src/persistence/event-repository.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/services/health-check.js', () => ({
  getHealthStatus: vi.fn(),
}));

vi.mock('../../src/cost/cost-summary.js', () => ({
  buildCostSummary: vi.fn(),
}));

const mockedGetHealthStatus = vi.mocked(healthCheckModule.getHealthStatus);
const mockedBuildCostSummary = vi.mocked(costSummaryModule.buildCostSummary);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHealthResult(status: 'ok' | 'degraded' | 'down'): HealthCheckResult {
  return {
    status,
    checks: {
      gateway: status !== 'down',
      database: status !== 'down',
      llmProvider: status === 'ok',
      telegram: status === 'ok',
      eventLog: status === 'ok',
    },
    timestamp: '2026-03-05T12:00:00.000Z',
  };
}

function makeQueryResult(overrides?: Partial<EventQueryResult>): EventQueryResult {
  return {
    events: [],
    total: 0,
    aggregates: {
      byAgent: {},
      byEventType: {},
      avgCycleTimeMs: null,
    },
    ...overrides,
  };
}

function createDeps(overrides?: Partial<MonitoringCronDeps>): MonitoringCronDeps {
  return {
    healthCheckDeps: {
      db: {} as never,
      pluginConfig: {},
      eventLogWritable: () => true,
    },
    eventRepo: {
      queryEvents: vi.fn(() => makeQueryResult()),
    } as unknown as MonitoringCronDeps['eventRepo'],
    logger: { info: vi.fn(), warn: vi.fn() },
    telegramChatId: undefined,
    ...overrides,
  };
}

// A minimal fetch response helper
function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Saved env vars
// ---------------------------------------------------------------------------

const TELEGRAM_KEYS = [
  'TELEGRAM_BOT_TOKEN_PM',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_GROUP_ID',
] as const;

let savedEnv: Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('monitoring-cron', () => {
  let deps: MonitoringCronDeps;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Save and clear relevant env vars
    savedEnv = {};
    for (const key of TELEGRAM_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    deps = createDeps();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
    mockedGetHealthStatus.mockReturnValue(makeHealthResult('ok'));
    mockedBuildCostSummary.mockReturnValue({
      totalTokens: 0,
      totalDurationMs: 0,
      eventCount: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    // Restore env vars
    for (const key of TELEGRAM_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  // =========================================================================
  // Lifecycle: start / stop
  // =========================================================================

  describe('start() and stop()', () => {
    it('logs "started" when start() is called', () => {
      const cron = new MonitoringCron(deps);
      cron.start();
      expect(deps.logger.info).toHaveBeenCalledWith('monitoring-cron: started');
      cron.stop();
    });

    it('logs "stopped" when stop() is called', () => {
      const cron = new MonitoringCron(deps);
      cron.start();
      cron.stop();
      expect(deps.logger.info).toHaveBeenCalledWith('monitoring-cron: stopped');
    });

    it('stop() is safe to call when not started', () => {
      const cron = new MonitoringCron(deps);
      cron.stop();
      expect(deps.logger.info).toHaveBeenCalledWith('monitoring-cron: stopped');
    });

    it('stop() clears all timers so callbacks no longer fire', async () => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      cron.stop();

      // Advance past all intervals
      await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Telegram config resolution
  // =========================================================================

  describe('telegram config resolution', () => {
    it('does nothing when no telegram token is configured', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when token is whitespace-only', async () => {
      process.env['TELEGRAM_BOT_TOKEN'] = '   ';
      process.env['TELEGRAM_CHAT_ID'] = '123';
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when chat id is whitespace-only', async () => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '   ';
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('prefers TELEGRAM_BOT_TOKEN_PM over TELEGRAM_BOT_TOKEN', async () => {
      process.env['TELEGRAM_BOT_TOKEN_PM'] = 'pm-tok';
      process.env['TELEGRAM_BOT_TOKEN'] = 'generic-tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('botpm-tok/sendMessage'),
        expect.anything(),
      );
    });

    it('uses telegramChatId from deps over env vars', async () => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = 'env-chat';
      deps = createDeps({ telegramChatId: 'deps-chat' });
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(callBody.chat_id).toBe('deps-chat');
    });

    it('falls back to TELEGRAM_GROUP_ID when TELEGRAM_CHAT_ID is unset', async () => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_GROUP_ID'] = 'group-123';
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(callBody.chat_id).toBe('group-123');
    });
  });

  // =========================================================================
  // Health check interval
  // =========================================================================

  describe('runHealthCheck (5-minute interval)', () => {
    beforeEach(() => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
    });

    it('fires after 5 minutes', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(mockedGetHealthStatus).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT post to Telegram when health status is ok', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('ok'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(mockedGetHealthStatus).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('posts to Telegram when health status is degraded', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('api.telegram.org/bottok/sendMessage');

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(body.parse_mode).toBe('Markdown');
      expect(body.text).toContain('DEGRADED');
    });

    it('posts to Telegram when health status is down', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('down'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(body.text).toContain('DOWN');
    });

    it('formats health message with correct check statuses for degraded', async () => {
      // degraded = llmProvider false, eventLog false (per makeHealthResult)
      const result = makeHealthResult('degraded');
      mockedGetHealthStatus.mockReturnValue(result);

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      const text = body.text as string;
      expect(text).toContain('Gateway: ok');
      expect(text).toContain('Database: ok');
      expect(text).toContain('LLM Provider: not configured');
      expect(text).toContain('Telegram: not configured');
      expect(text).toContain('Event Log: error');
    });

    it('formats health message with all-true checks when manually specified', async () => {
      const result: HealthCheckResult = {
        status: 'degraded', // still alerts
        checks: {
          gateway: true,
          database: true,
          llmProvider: true,
          telegram: true,
          eventLog: true,
        },
        timestamp: '2026-03-05T12:00:00.000Z',
      };
      mockedGetHealthStatus.mockReturnValue(result);

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      const text = body.text as string;
      expect(text).toContain('LLM Provider: connected');
      expect(text).toContain('Telegram: connected');
      expect(text).toContain('Event Log: writable');
    });

    it('formats health message with "down" and "not configured" for false checks', async () => {
      const result: HealthCheckResult = {
        status: 'down',
        checks: {
          gateway: false,
          database: false,
          llmProvider: false,
          telegram: false,
          eventLog: false,
        },
        timestamp: '2026-03-05T12:00:00.000Z',
      };
      mockedGetHealthStatus.mockReturnValue(result);

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      const text = body.text as string;
      expect(text).toContain('Gateway: down');
      expect(text).toContain('Database: down');
      expect(text).toContain('LLM Provider: not configured');
      expect(text).toContain('Telegram: not configured');
      expect(text).toContain('Event Log: error');
    });

    it('logs a warning when Telegram API call fails', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));
      fetchSpy.mockResolvedValueOnce(errorResponse(403, 'Forbidden'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('health check alert failed'),
      );
    });

    it('logs a warning when fetch itself throws', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('health check alert failed'),
      );
    });

    it('fires multiple times across multiple intervals', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000); // 3 intervals
      cron.stop();

      expect(mockedGetHealthStatus).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Activity summary interval
  // =========================================================================

  describe('runActivitySummary (1-hour interval)', () => {
    beforeEach(() => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
    });

    it('fires after 1 hour and queries events', async () => {
      const queryEvents = vi.fn(() =>
        makeQueryResult({
          aggregates: {
            byAgent: { 'back-1': 10, 'front-1': 5 },
            byEventType: {},
            avgCycleTimeMs: null,
          },
        }),
      );
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      cron.stop();

      expect(queryEvents).toHaveBeenCalledTimes(1);
      const queryArg = queryEvents.mock.calls[0]![0];
      expect(queryArg.limit).toBe(1000);
      expect(queryArg.offset).toBe(0);
      expect(queryArg.since).toBeDefined();
    });

    it('posts formatted activity message with agent counts sorted descending', async () => {
      const queryEvents = vi.fn(() =>
        makeQueryResult({
          aggregates: {
            byAgent: { 'front-1': 5, 'back-1': 10, 'qa-1': 3 },
            byEventType: {},
            avgCycleTimeMs: null,
          },
        }),
      );
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      cron.stop();

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      const text = body.text as string;
      expect(text).toContain('Agent Activity');
      expect(text).toContain('back-1: 10 events');
      expect(text).toContain('front-1: 5 events');
      expect(text).toContain('qa-1: 3 events');
      // back-1 (10) should appear before front-1 (5)
      expect(text.indexOf('back-1')).toBeLessThan(text.indexOf('front-1'));
    });

    it('shows "No activity recorded" when there are zero events', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      cron.stop();

      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(body.text).toContain('No activity recorded');
    });

    it('logs a warning when queryEvents throws', async () => {
      const queryEvents = vi.fn(() => {
        throw new Error('DB read error');
      });
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('activity summary failed'),
      );
    });

    it('logs a warning when Telegram post fails for activity', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      fetchSpy.mockResolvedValue(errorResponse(500, 'Internal Server Error'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('activity summary failed'),
      );
    });
  });

  // =========================================================================
  // Cost summary interval
  // =========================================================================

  describe('runCostSummary (24-hour interval)', () => {
    beforeEach(() => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
    });

    it('fires after 24 hours and queries events with limit 5000', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      // Activity summary fires every hour (24 calls with limit=1000)
      // Cost summary fires once at 24h (1 call with limit=5000)
      // Total: 25 calls
      expect(queryEvents).toHaveBeenCalledTimes(25);

      // Verify that at least one call used limit=5000 (the cost summary call)
      const costCall = queryEvents.mock.calls.find(
        (args) => (args[0] as { limit: number }).limit === 5000,
      );
      expect(costCall).toBeDefined();
      const costArg = costCall![0] as { limit: number; offset: number; since: string };
      expect(costArg.offset).toBe(0);
      expect(costArg.since).toBeDefined();
    });

    it('calls buildCostSummary with the queried events', async () => {
      const events = [
        { id: '1', taskId: 't1', eventType: 'cost.llm', agentId: 'a1', payload: {}, createdAt: '' },
      ];
      const queryEvents = vi.fn(() => makeQueryResult({ events }));
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      mockedBuildCostSummary.mockReturnValue({
        totalTokens: 50_000,
        totalDurationMs: 12_000,
        eventCount: 1,
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      expect(mockedBuildCostSummary).toHaveBeenCalledWith(events);
    });

    it('posts formatted cost message with token count, duration, and event count', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      mockedBuildCostSummary.mockReturnValue({
        totalTokens: 123_456,
        totalDurationMs: 45_678,
        eventCount: 42,
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      // Find the fetch call containing the cost summary message
      const costCall = fetchSpy.mock.calls.find((args) => {
        const reqBody = JSON.parse((args[1] as RequestInit).body as string);
        return (reqBody.text as string).includes('Daily Cost Summary');
      });
      expect(costCall).toBeDefined();

      const body = JSON.parse((costCall![1] as RequestInit).body as string);
      const text = body.text as string;
      expect(text).toContain('Daily Cost Summary');
      // toLocaleString() is locale-dependent; check for the number in any format
      expect(text).toMatch(/123[.,]456/);
      expect(text).toContain('45.7');
      expect(text).toContain('Cost events: 42');
    });

    it('logs a warning when queryEvents throws in cost summary', async () => {
      const queryEvents = vi.fn(() => {
        throw new Error('DB failure');
      });
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cost summary failed'),
      );
    });

    it('logs a warning when buildCostSummary throws', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      mockedBuildCostSummary.mockImplementation(() => {
        throw new Error('cost parse error');
      });

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cost summary failed'),
      );
    });

    it('logs a warning when Telegram post fails for cost summary', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      mockedBuildCostSummary.mockReturnValue({
        totalTokens: 0,
        totalDurationMs: 0,
        eventCount: 0,
      });
      fetchSpy.mockResolvedValue(errorResponse(429, 'Rate limited'));

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cost summary failed'),
      );
    });
  });

  // =========================================================================
  // postTelegram error handling (exercised via Telegram error responses)
  // =========================================================================

  describe('postTelegram error handling', () => {
    beforeEach(() => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
    });

    it('catches when response.text() rejects during error handling', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('cannot read body')),
      } as unknown as Response);

      const cron = new MonitoringCron(deps);
      cron.start();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      cron.stop();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('health check alert failed'),
      );
    });
  });

  // =========================================================================
  // Interval scheduling: multiple ticks
  // =========================================================================

  describe('interval scheduling', () => {
    beforeEach(() => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'tok';
      process.env['TELEGRAM_CHAT_ID'] = '123';
    });

    it('does not fire any callback before the first interval elapses', async () => {
      mockedGetHealthStatus.mockReturnValue(makeHealthResult('degraded'));

      const cron = new MonitoringCron(deps);
      cron.start();
      // Advance only 4 minutes (just shy of the 5-minute health interval)
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
      cron.stop();

      expect(mockedGetHealthStatus).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('activity fires at 1h but not before', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });

      const cron = new MonitoringCron(deps);
      cron.start();

      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(queryEvents).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1 * 60 * 1000); // now at 60 min
      expect(queryEvents).toHaveBeenCalledTimes(1);

      cron.stop();
    });

    it('cost summary does not fire at 23h but fires at 24h', async () => {
      const queryEvents = vi.fn(() => makeQueryResult());
      deps = createDeps({
        eventRepo: { queryEvents } as unknown as MonitoringCronDeps['eventRepo'],
      });
      mockedBuildCostSummary.mockReturnValue({
        totalTokens: 0,
        totalDurationMs: 0,
        eventCount: 0,
      });

      const cron = new MonitoringCron(deps);
      cron.start();

      // At 23 hours the cost summary should not have fired yet.
      // However, activity summary fires every hour, so queryEvents gets called by that.
      // We need to count calls that happen at the 24h mark from buildCostSummary.
      await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
      expect(mockedBuildCostSummary).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000); // now at 24h
      expect(mockedBuildCostSummary).toHaveBeenCalledTimes(1);

      cron.stop();
    });
  });
});
