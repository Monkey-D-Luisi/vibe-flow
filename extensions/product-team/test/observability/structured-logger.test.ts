import { describe, it, expect, vi } from 'vitest';
import { createStructuredLogger } from '../../src/observability/structured-logger.js';

describe('createStructuredLogger', () => {
  function createMockLogger() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it('outputs structured JSON to info', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'test-ext');

    slog.info('plugin.loaded');

    expect(base.info).toHaveBeenCalledOnce();
    const raw = base.info.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['ext']).toBe('test-ext');
    expect(parsed['op']).toBe('plugin.loaded');
    expect(parsed).toHaveProperty('ts');
  });

  it('outputs structured JSON to warn', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'test-ext');

    slog.warn('health.degraded', { reason: 'db slow' });

    expect(base.warn).toHaveBeenCalledOnce();
    const raw = base.warn.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['level']).toBe('warn');
    expect(parsed['op']).toBe('health.degraded');
    expect(parsed['reason']).toBe('db slow');
  });

  it('outputs structured JSON to error', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'test-ext');

    slog.error('db.crash', { message: 'connection lost' });

    expect(base.error).toHaveBeenCalledOnce();
    const raw = base.error.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['level']).toBe('error');
    expect(parsed['op']).toBe('db.crash');
    expect(parsed['message']).toBe('connection lost');
  });

  it('includes context fields in output', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'product-team');

    slog.info('tool.registered', { count: 37, category: 'workflow' });

    const raw = base.info.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['count']).toBe(37);
    expect(parsed['category']).toBe('workflow');
    expect(parsed['ext']).toBe('product-team');
  });

  it('works without context parameter', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'product-team');

    slog.info('cron.started');

    const raw = base.info.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['op']).toBe('cron.started');
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(['ts', 'level', 'ext', 'op']),
    );
  });

  it('includes ISO timestamp', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'test-ext');

    slog.info('check');

    const raw = base.info.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ts = parsed['ts'] as string;
    // Should be valid ISO 8601
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('preserves extension name across calls', () => {
    const base = createMockLogger();
    const slog = createStructuredLogger(base, 'my-ext');

    slog.info('first');
    slog.warn('second');
    slog.error('third');

    for (const method of ['info', 'warn', 'error'] as const) {
      const raw = base[method].mock.calls[0][0] as string;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed['ext']).toBe('my-ext');
    }
  });
});
