import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGracefulShutdown, type GracefulShutdownDeps } from '../../src/hooks/graceful-shutdown.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createDeps(overrides?: Partial<GracefulShutdownDeps>): GracefulShutdownDeps {
  return {
    db: {
      pragma: vi.fn(),
    } as unknown as GracefulShutdownDeps['db'],
    leaseRepo: {
      expireStale: vi.fn(() => 0),
    } as unknown as GracefulShutdownDeps['leaseRepo'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    ...overrides,
  };
}

// ── createGracefulShutdown ──────────────────────────────────────────────────

describe('createGracefulShutdown', () => {
  let deps: GracefulShutdownDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  it('returns a function', () => {
    const shutdown = createGracefulShutdown(deps);
    expect(typeof shutdown).toBe('function');
  });

  it('logs start and completion messages', () => {
    const shutdown = createGracefulShutdown(deps);
    shutdown();

    expect(deps.logger.info).toHaveBeenCalledWith(
      'graceful-shutdown: starting shutdown sequence',
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      'graceful-shutdown: shutdown sequence complete',
    );
  });

  // ── Step 1: monitoring cron ───────────────────────────────────────────────

  describe('monitoring cron stop', () => {
    it('calls stopMonitoringCron when provided', () => {
      const stopMonitoringCron = vi.fn();
      deps = createDeps({ stopMonitoringCron });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(stopMonitoringCron).toHaveBeenCalledTimes(1);
    });

    it('tolerates missing stopMonitoringCron (undefined)', () => {
      deps = createDeps({ stopMonitoringCron: undefined });
      const shutdown = createGracefulShutdown(deps);

      expect(() => shutdown()).not.toThrow();
    });

    it('catches and logs error when stopMonitoringCron throws', () => {
      const stopMonitoringCron = vi.fn(() => {
        throw new Error('cron stop boom');
      });
      deps = createDeps({ stopMonitoringCron });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('monitoring cron stop error'),
      );
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cron stop boom'),
      );
    });

    it('continues shutdown even when stopMonitoringCron throws', () => {
      const stopMonitoringCron = vi.fn(() => {
        throw new Error('cron fail');
      });
      deps = createDeps({ stopMonitoringCron });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      // Still proceeds to expire leases and checkpoint
      expect(deps.leaseRepo.expireStale).toHaveBeenCalled();
      expect(deps.db.pragma).toHaveBeenCalled();
      expect(deps.logger.info).toHaveBeenCalledWith(
        'graceful-shutdown: shutdown sequence complete',
      );
    });
  });

  // ── Step 2: lease expiry ──────────────────────────────────────────────────

  describe('lease release', () => {
    it('calls expireStale with a far-future timestamp', () => {
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.leaseRepo.expireStale).toHaveBeenCalledTimes(1);
      const timestamp = (deps.leaseRepo.expireStale as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // The timestamp should be roughly 24 hours in the future (ISO string)
      const parsed = Date.parse(timestamp);
      expect(parsed).toBeGreaterThan(Date.now());
    });

    it('logs released lease count when leases are released', () => {
      deps = createDeps({
        leaseRepo: {
          expireStale: vi.fn(() => 3),
        } as unknown as GracefulShutdownDeps['leaseRepo'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.info).toHaveBeenCalledWith(
        'graceful-shutdown: released 3 active leases',
      );
    });

    it('does not log released count when no leases are released', () => {
      deps = createDeps({
        leaseRepo: {
          expireStale: vi.fn(() => 0),
        } as unknown as GracefulShutdownDeps['leaseRepo'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      const infoCalls = (deps.logger.info as ReturnType<typeof vi.fn>).mock.calls
        .map(([msg]: [string]) => msg);
      expect(infoCalls).not.toContain(
        expect.stringContaining('released'),
      );
    });

    it('catches and logs error when expireStale throws', () => {
      deps = createDeps({
        leaseRepo: {
          expireStale: vi.fn(() => {
            throw new Error('lease db error');
          }),
        } as unknown as GracefulShutdownDeps['leaseRepo'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('lease release failed'),
      );
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('lease db error'),
      );
    });

    it('continues to WAL checkpoint even when lease release fails', () => {
      deps = createDeps({
        leaseRepo: {
          expireStale: vi.fn(() => {
            throw new Error('lease fail');
          }),
        } as unknown as GracefulShutdownDeps['leaseRepo'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.db.pragma).toHaveBeenCalledWith('wal_checkpoint(FULL)');
    });
  });

  // ── Step 3: WAL checkpoint ────────────────────────────────────────────────

  describe('WAL checkpoint', () => {
    it('calls pragma with wal_checkpoint(FULL)', () => {
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.db.pragma).toHaveBeenCalledWith('wal_checkpoint(FULL)');
    });

    it('logs success after WAL checkpoint', () => {
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.info).toHaveBeenCalledWith(
        'graceful-shutdown: WAL checkpoint completed',
      );
    });

    it('catches and logs error when WAL checkpoint throws', () => {
      deps = createDeps({
        db: {
          pragma: vi.fn(() => {
            throw new Error('WAL crash');
          }),
        } as unknown as GracefulShutdownDeps['db'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('WAL checkpoint error'),
      );
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('WAL crash'),
      );
    });

    it('still logs completion even when WAL checkpoint fails', () => {
      deps = createDeps({
        db: {
          pragma: vi.fn(() => {
            throw new Error('WAL crash');
          }),
        } as unknown as GracefulShutdownDeps['db'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      expect(deps.logger.info).toHaveBeenCalledWith(
        'graceful-shutdown: shutdown sequence complete',
      );
    });
  });

  // ── All-errors scenario ───────────────────────────────────────────────────

  describe('all steps failing', () => {
    it('completes shutdown even when all three steps throw', () => {
      deps = createDeps({
        stopMonitoringCron: vi.fn(() => {
          throw new Error('cron fail');
        }),
        leaseRepo: {
          expireStale: vi.fn(() => {
            throw new Error('lease fail');
          }),
        } as unknown as GracefulShutdownDeps['leaseRepo'],
        db: {
          pragma: vi.fn(() => {
            throw new Error('wal fail');
          }),
        } as unknown as GracefulShutdownDeps['db'],
      });
      const shutdown = createGracefulShutdown(deps);
      shutdown();

      // All three errors should be logged
      expect(deps.logger.warn).toHaveBeenCalledTimes(3);
      // And shutdown still completes
      expect(deps.logger.info).toHaveBeenCalledWith(
        'graceful-shutdown: shutdown sequence complete',
      );
    });
  });
});
