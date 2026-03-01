import type Database from 'better-sqlite3';
import type { SqliteLeaseRepository } from '../persistence/lease-repository.js';

interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface GracefulShutdownDeps {
  readonly db: Database.Database;
  readonly leaseRepo: SqliteLeaseRepository;
  readonly logger: Logger;
  /** Callback to stop the monitoring cron, if started */
  readonly stopMonitoringCron?: () => void;
}

/**
 * Flush the event log and save in-progress agent state before shutdown.
 * Returns a cleanup function that should be passed to registerProcessShutdownHooks.
 */
export function createGracefulShutdown(deps: GracefulShutdownDeps): () => void {
  return () => {
    deps.logger.info('graceful-shutdown: starting shutdown sequence');

    // 1. Stop monitoring cron to prevent new Telegram posts during teardown
    try {
      deps.stopMonitoringCron?.();
    } catch (err: unknown) {
      deps.logger.warn(`graceful-shutdown: monitoring cron stop error: ${String(err)}`);
    }

    // 2. Expire all active leases so in-progress agent state is released
    try {
      // Use a far-future timestamp to clear all active leases
      const farFuture = new Date(Date.now() + 86_400_000).toISOString();
      const released = deps.leaseRepo.expireStale(farFuture);
      if (released > 0) {
        deps.logger.info(`graceful-shutdown: released ${released} active leases`);
      }
    } catch (err: unknown) {
      deps.logger.warn(`graceful-shutdown: lease release failed: ${String(err)}`);
    }

    // 3. Flush WAL by checkpointing the database
    try {
      deps.db.pragma('wal_checkpoint(FULL)');
      deps.logger.info('graceful-shutdown: WAL checkpoint completed');
    } catch (err: unknown) {
      deps.logger.warn(`graceful-shutdown: WAL checkpoint error: ${String(err)}`);
    }

    deps.logger.info('graceful-shutdown: shutdown sequence complete');
  };
}
