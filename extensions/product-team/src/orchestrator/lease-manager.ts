import type { SqliteLeaseRepository, LeaseRecord } from '../persistence/lease-repository.js';
import type { EventLog } from './event-log.js';
import { LeaseCapacityError } from '../domain/errors.js';

const DEFAULT_DURATION_MS = 300_000; // 5 minutes
const DEFAULT_MAX_LEASES_PER_AGENT = 3;
const DEFAULT_MAX_TOTAL_LEASES = 10;

export interface LeaseManagerConcurrencyConfig {
  readonly maxLeasesPerAgent?: number;
  readonly maxTotalLeases?: number;
}

/**
 * Business-level lease operations with event logging.
 */
export class LeaseManager {
  constructor(
    private readonly leaseRepo: SqliteLeaseRepository,
    private readonly eventLog: EventLog,
    private readonly now: () => string,
    private readonly defaultDurationMs: number = DEFAULT_DURATION_MS,
    private readonly concurrencyConfig: LeaseManagerConcurrencyConfig = {},
  ) {}

  acquire(
    taskId: string,
    agentId: string,
    durationMs?: number,
  ): LeaseRecord {
    const acquiredAt = this.now();
    this.leaseRepo.expireStale(acquiredAt);

    const existingLease = this.leaseRepo.getByTaskId(taskId);
    const maxLeasesPerAgent =
      this.concurrencyConfig.maxLeasesPerAgent ?? DEFAULT_MAX_LEASES_PER_AGENT;
    const maxTotalLeases =
      this.concurrencyConfig.maxTotalLeases ?? DEFAULT_MAX_TOTAL_LEASES;

    if (!existingLease || existingLease.agentId !== agentId) {
      const activeByAgent = this.leaseRepo.countByAgent(agentId, acquiredAt);
      if (activeByAgent >= maxLeasesPerAgent) {
        throw new LeaseCapacityError(
          `Agent ${agentId} has ${activeByAgent}/${maxLeasesPerAgent} active leases. ` +
          'Release a task before acquiring another lease.',
        );
      }

      const activeTotal = this.leaseRepo.countActive(acquiredAt);
      if (activeTotal >= maxTotalLeases) {
        throw new LeaseCapacityError(
          `Global lease capacity reached (${activeTotal}/${maxTotalLeases}). ` +
          'Release a task before acquiring another lease.',
        );
      }
    }

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
