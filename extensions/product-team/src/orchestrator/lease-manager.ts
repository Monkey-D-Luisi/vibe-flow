import type { SqliteLeaseRepository, LeaseRecord } from '../persistence/lease-repository.js';
import type { EventLog } from './event-log.js';

const DEFAULT_DURATION_MS = 300_000; // 5 minutes

/**
 * Business-level lease operations with event logging.
 */
export class LeaseManager {
  constructor(
    private readonly leaseRepo: SqliteLeaseRepository,
    private readonly eventLog: EventLog,
    private readonly now: () => string,
    private readonly defaultDurationMs: number = DEFAULT_DURATION_MS,
  ) {}

  acquire(
    taskId: string,
    agentId: string,
    durationMs?: number,
  ): LeaseRecord {
    const acquiredAt = this.now();
    const duration = durationMs ?? this.defaultDurationMs;
    const expiresAt = new Date(
      new Date(acquiredAt).getTime() + duration,
    ).toISOString();

    const lease = this.leaseRepo.acquire(taskId, agentId, acquiredAt, expiresAt);
    this.eventLog.logLeaseAcquired(taskId, agentId);
    return lease;
  }

  release(taskId: string, agentId: string): void {
    this.leaseRepo.release(taskId, agentId);
    this.eventLog.logLeaseReleased(taskId, agentId);
  }

  isHeldBy(taskId: string, agentId: string): boolean {
    const now = this.now();
    // Expire stale leases first
    this.leaseRepo.expireStale(now);

    const lease = this.leaseRepo.getByTaskId(taskId);
    return lease !== null && lease.agentId === agentId;
  }

  getByTaskId(taskId: string): LeaseRecord | null {
    return this.leaseRepo.getByTaskId(taskId);
  }
}
