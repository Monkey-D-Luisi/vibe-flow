import { describe, it, expect, vi } from 'vitest';
import { createCorrelatedLogger } from '../../src/logging/correlated-logger.js';

describe('createCorrelatedLogger', () => {
  it('emits structured info logs with correlation and defaults', () => {
    const baseLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const logger = createCorrelatedLogger(baseLogger, 'CID-001', {
      agentId: 'dev',
      taskId: 'TASK-1',
    });

    logger.info('quality.tests.complete', { durationMs: 12, failed: 0 });
    expect(baseLogger.info).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(baseLogger.info.mock.calls[0][0]) as Record<string, unknown>;
    expect(payload.correlationId).toBe('CID-001');
    expect(payload.agentId).toBe('dev');
    expect(payload.taskId).toBe('TASK-1');
    expect(payload.op).toBe('quality.tests.complete');
    expect(payload.level).toBe('info');
    expect(payload.durationMs).toBe(12);
    expect(typeof payload.ts).toBe('string');
  });

  it('falls back to info when debug logger is not provided', () => {
    const baseLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createCorrelatedLogger(baseLogger, 'CID-002');

    logger.debug('debug-op', { foo: 'bar' });
    expect(baseLogger.info).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(baseLogger.info.mock.calls[0][0]) as Record<string, unknown>;
    expect(payload.level).toBe('debug');
    expect(payload.op).toBe('debug-op');
    expect(payload.foo).toBe('bar');
  });
});
