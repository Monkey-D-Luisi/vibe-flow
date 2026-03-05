import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeCiMetadata, updateTaskMetadataWithRetry } from '../../src/github/ci-feedback-metadata.js';
import { StaleRevisionError } from '../../src/domain/errors.js';
import type { NormalizedGithubCiEvent } from '../../src/github/ci-feedback-utils.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides?: Partial<NormalizedGithubCiEvent>): NormalizedGithubCiEvent {
  return {
    source: 'github',
    eventName: 'check_run',
    action: 'completed',
    repository: 'acme/vibe-flow',
    branch: 'task/TASK-100-fix',
    prNumber: 42,
    runUrl: 'https://ci.example/run/1',
    overallStatus: 'completed',
    overallConclusion: 'success',
    checks: [
      {
        name: 'CI / test',
        status: 'completed',
        conclusion: 'success',
        detailsUrl: 'https://ci.example/run/1/details',
      },
    ],
    ...overrides,
  };
}

// ── mergeCiMetadata ─────────────────────────────────────────────────────────

describe('mergeCiMetadata', () => {
  const timestamp = '2026-02-25T12:00:00.000Z';

  it('creates ci metadata from empty metadata', () => {
    const result = mergeCiMetadata({}, makeEvent(), 'delivery-1', timestamp);

    expect(result.ci).toBeDefined();
    const ci = result.ci as Record<string, unknown>;
    expect(ci.source).toBe('github');
    expect(ci.repository).toBe('acme/vibe-flow');
    expect(ci.branch).toBe('task/TASK-100-fix');
    expect(ci.prNumber).toBe(42);
    expect(ci.lastEventName).toBe('check_run');
    expect(ci.lastAction).toBe('completed');
    expect(ci.lastStatus).toBe('completed');
    expect(ci.lastConclusion).toBe('success');
    expect(ci.runUrl).toBe('https://ci.example/run/1');
    expect(ci.lastDeliveryId).toBe('delivery-1');
    expect(ci.updatedAt).toBe(timestamp);
  });

  it('creates check entries for each check in the event', () => {
    const event = makeEvent({
      checks: [
        { name: 'CI / test', status: 'completed', conclusion: 'success', detailsUrl: 'https://ci/test' },
        { name: 'CI / lint', status: 'completed', conclusion: 'failure', detailsUrl: 'https://ci/lint' },
      ],
    });
    const result = mergeCiMetadata({}, event, 'delivery-1', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const checks = ci.checks as Record<string, unknown>;

    expect(checks['CI / test']).toEqual({
      status: 'completed',
      conclusion: 'success',
      detailsUrl: 'https://ci/test',
      updatedAt: timestamp,
    });
    expect(checks['CI / lint']).toEqual({
      status: 'completed',
      conclusion: 'failure',
      detailsUrl: 'https://ci/lint',
      updatedAt: timestamp,
    });
  });

  it('preserves existing ci.checks and adds new ones', () => {
    const existingMetadata = {
      ci: {
        checks: {
          'CI / build': { status: 'completed', conclusion: 'success', detailsUrl: null, updatedAt: '2026-02-24T00:00:00Z' },
        },
      },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-2', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const checks = ci.checks as Record<string, unknown>;

    expect(checks).toHaveProperty('CI / build');
    expect(checks).toHaveProperty('CI / test');
  });

  it('overwrites existing check with same name', () => {
    const existingMetadata = {
      ci: {
        checks: {
          'CI / test': { status: 'in_progress', conclusion: null, detailsUrl: null, updatedAt: '2026-02-24T00:00:00Z' },
        },
      },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-3', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const checks = ci.checks as Record<string, unknown>;
    const ciTest = checks['CI / test'] as Record<string, unknown>;

    expect(ciTest.conclusion).toBe('success');
    expect(ciTest.updatedAt).toBe(timestamp);
  });

  it('accepts null deliveryId', () => {
    const result = mergeCiMetadata({}, makeEvent(), null, timestamp);
    const ci = result.ci as Record<string, unknown>;

    expect(ci.lastDeliveryId).toBeNull();
  });

  it('preserves existing prNumber when event has no prNumber', () => {
    const existingMetadata = {
      ci: { prNumber: 99 },
    };
    const event = makeEvent({ prNumber: null });
    const result = mergeCiMetadata(existingMetadata, event, 'delivery-4', timestamp);
    const ci = result.ci as Record<string, unknown>;

    expect(ci.prNumber).toBe(99);
  });

  it('sets prNumber to null when neither event nor existing has one', () => {
    const result = mergeCiMetadata({}, makeEvent({ prNumber: null }), 'delivery-5', timestamp);
    const ci = result.ci as Record<string, unknown>;

    expect(ci.prNumber).toBeNull();
  });

  it('overrides existing prNumber when event provides one', () => {
    const existingMetadata = {
      ci: { prNumber: 50 },
    };
    const event = makeEvent({ prNumber: 77 });
    const result = mergeCiMetadata(existingMetadata, event, 'delivery-6', timestamp);
    const ci = result.ci as Record<string, unknown>;

    expect(ci.prNumber).toBe(77);
  });

  it('appends to history array', () => {
    const result = mergeCiMetadata({}, makeEvent(), 'delivery-7', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        deliveryId: 'delivery-7',
        eventName: 'check_run',
        action: 'completed',
        branch: 'task/TASK-100-fix',
        prNumber: 42,
        conclusion: 'success',
        status: 'completed',
        runUrl: 'https://ci.example/run/1',
        processedAt: timestamp,
      }),
    );
  });

  it('preserves existing history entries', () => {
    const existingMetadata = {
      ci: {
        history: [
          { deliveryId: 'old-1', eventName: 'check_run', action: 'completed' },
        ],
      },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-8', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(expect.objectContaining({ deliveryId: 'old-1' }));
    expect(history[1]).toEqual(expect.objectContaining({ deliveryId: 'delivery-8' }));
  });

  it('trims history to MAX_CI_HISTORY_ENTRIES (20)', () => {
    const existingHistory = Array.from({ length: 25 }, (_, i) => ({
      deliveryId: `old-${i}`,
      eventName: 'check_run',
      action: 'completed',
    }));
    const existingMetadata = {
      ci: { history: existingHistory },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-trim', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];

    expect(history).toHaveLength(20);
    // Last entry should be the newly added one
    expect(history[history.length - 1]).toEqual(
      expect.objectContaining({ deliveryId: 'delivery-trim' }),
    );
  });

  it('filters out non-object items from existing history', () => {
    const existingMetadata = {
      ci: {
        history: [
          'invalid-string',
          42,
          null,
          { deliveryId: 'valid-1', eventName: 'check_run' },
          [1, 2, 3],
        ],
      },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-filter', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];

    // Only the valid object plus the new entry
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(expect.objectContaining({ deliveryId: 'valid-1' }));
  });

  it('handles non-array history gracefully (treats as empty)', () => {
    const existingMetadata = {
      ci: { history: 'not-an-array' },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-noarray', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];

    expect(history).toHaveLength(1);
  });

  it('handles metadata where ci is not an object', () => {
    const existingMetadata = { ci: 'not-an-object' };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-bad-ci', timestamp);
    const ci = result.ci as Record<string, unknown>;

    // Should create fresh ci metadata since existing ci is not a record
    expect(ci.source).toBe('github');
    expect(ci.checks).toBeDefined();
  });

  it('handles metadata where ci.checks is not an object', () => {
    const existingMetadata = {
      ci: { checks: 'not-an-object' },
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-bad-checks', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const checks = ci.checks as Record<string, unknown>;

    // Should create fresh checks
    expect(checks).toHaveProperty('CI / test');
  });

  it('handles metadata where ci is an array (asRecord returns null)', () => {
    const existingMetadata = { ci: [1, 2, 3] };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-ci-array', timestamp);
    const ci = result.ci as Record<string, unknown>;

    expect(ci.source).toBe('github');
  });

  it('preserves non-ci metadata properties', () => {
    const existingMetadata = {
      review_result: { violations: [] },
      custom_field: 'keep-me',
    };
    const result = mergeCiMetadata(existingMetadata, makeEvent(), 'delivery-preserve', timestamp);

    expect(result.review_result).toEqual({ violations: [] });
    expect(result.custom_field).toBe('keep-me');
  });

  it('includes check summary in history entries', () => {
    const event = makeEvent({
      checks: [
        { name: 'CI / test', status: 'completed', conclusion: 'success', detailsUrl: null },
        { name: 'CI / lint', status: 'completed', conclusion: 'failure', detailsUrl: null },
      ],
    });
    const result = mergeCiMetadata({}, event, 'delivery-checks', timestamp);
    const ci = result.ci as Record<string, unknown>;
    const history = ci.history as Record<string, unknown>[];
    const checksInHistory = history[0].checks as Array<Record<string, unknown>>;

    expect(checksInHistory).toHaveLength(2);
    expect(checksInHistory[0]).toEqual({ name: 'CI / test', status: 'completed', conclusion: 'success' });
    expect(checksInHistory[1]).toEqual({ name: 'CI / lint', status: 'completed', conclusion: 'failure' });
  });
});

// ── updateTaskMetadataWithRetry ─────────────────────────────────────────────

describe('updateTaskMetadataWithRetry', () => {
  let taskRepo: {
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let nowFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    taskRepo = {
      getById: vi.fn(),
      update: vi.fn(),
    };
    nowFn = vi.fn(() => '2026-02-25T12:00:00.000Z');
  });

  it('updates task metadata on first attempt', () => {
    taskRepo.getById.mockReturnValue({
      metadata: {},
      rev: 1,
    });

    updateTaskMetadataWithRetry('TASK-100', makeEvent(), 'delivery-1', {
      taskRepo: taskRepo as never,
      now: nowFn,
    });

    expect(taskRepo.getById).toHaveBeenCalledWith('TASK-100');
    expect(taskRepo.update).toHaveBeenCalledTimes(1);
    expect(taskRepo.update).toHaveBeenCalledWith(
      'TASK-100',
      expect.objectContaining({ metadata: expect.any(Object) }),
      1,
      '2026-02-25T12:00:00.000Z',
    );
  });

  it('throws when task is not found', () => {
    taskRepo.getById.mockReturnValue(null);

    expect(() =>
      updateTaskMetadataWithRetry('TASK-MISSING', makeEvent(), 'delivery-2', {
        taskRepo: taskRepo as never,
        now: nowFn,
      }),
    ).toThrow('Task TASK-MISSING not found while processing CI feedback');
  });

  it('retries on StaleRevisionError and succeeds', () => {
    taskRepo.getById
      .mockReturnValueOnce({ metadata: {}, rev: 1 })
      .mockReturnValueOnce({ metadata: {}, rev: 2 });
    taskRepo.update
      .mockImplementationOnce(() => {
        throw new StaleRevisionError('TASK-100', 1, 2);
      })
      .mockImplementationOnce(() => undefined);

    updateTaskMetadataWithRetry('TASK-100', makeEvent(), 'delivery-retry', {
      taskRepo: taskRepo as never,
      now: nowFn,
    });

    expect(taskRepo.getById).toHaveBeenCalledTimes(2);
    expect(taskRepo.update).toHaveBeenCalledTimes(2);
  });

  it('throws non-StaleRevisionError immediately without retry', () => {
    taskRepo.getById.mockReturnValue({ metadata: {}, rev: 1 });
    taskRepo.update.mockImplementation(() => {
      throw new Error('database locked');
    });

    expect(() =>
      updateTaskMetadataWithRetry('TASK-100', makeEvent(), 'delivery-err', {
        taskRepo: taskRepo as never,
        now: nowFn,
      }),
    ).toThrow('database locked');

    // Only one attempt because it's not a StaleRevisionError
    expect(taskRepo.update).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting 3 retry attempts on StaleRevisionError', () => {
    taskRepo.getById.mockReturnValue({ metadata: {}, rev: 1 });
    taskRepo.update.mockImplementation(() => {
      throw new StaleRevisionError('TASK-100', 1, 2);
    });

    expect(() =>
      updateTaskMetadataWithRetry('TASK-100', makeEvent(), 'delivery-exhaust', {
        taskRepo: taskRepo as never,
        now: nowFn,
      }),
    ).toThrow('Failed to update task TASK-100 metadata after optimistic lock retries');

    expect(taskRepo.getById).toHaveBeenCalledTimes(3);
    expect(taskRepo.update).toHaveBeenCalledTimes(3);
  });

  it('passes null deliveryId through correctly', () => {
    taskRepo.getById.mockReturnValue({ metadata: {}, rev: 1 });

    updateTaskMetadataWithRetry('TASK-100', makeEvent(), null, {
      taskRepo: taskRepo as never,
      now: nowFn,
    });

    expect(taskRepo.update).toHaveBeenCalledTimes(1);
    // The metadata should have lastDeliveryId as null
    const updatedMetadata = taskRepo.update.mock.calls[0][1].metadata as Record<string, unknown>;
    const ci = updatedMetadata.ci as Record<string, unknown>;
    expect(ci.lastDeliveryId).toBeNull();
  });

  it('re-fetches task on each retry to get latest rev', () => {
    taskRepo.getById
      .mockReturnValueOnce({ metadata: {}, rev: 1 })
      .mockReturnValueOnce({ metadata: { ci: { branch: 'old' } }, rev: 2 })
      .mockReturnValueOnce({ metadata: { ci: { branch: 'old' } }, rev: 3 });

    taskRepo.update
      .mockImplementationOnce(() => {
        throw new StaleRevisionError('TASK-100', 1, 2);
      })
      .mockImplementationOnce(() => {
        throw new StaleRevisionError('TASK-100', 2, 3);
      })
      .mockImplementationOnce(() => undefined);

    updateTaskMetadataWithRetry('TASK-100', makeEvent(), 'delivery-refetch', {
      taskRepo: taskRepo as never,
      now: nowFn,
    });

    // On third attempt it should pass rev 3
    expect(taskRepo.update.mock.calls[2][2]).toBe(3);
  });
});
