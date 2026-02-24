import type Database from 'better-sqlite3';
import { LeaseConflictError, LeaseNotHeldError } from '../domain/errors.js';

export interface LeaseRecord {
  readonly taskId: string;
  readonly agentId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

interface LeaseRow {
  task_id: string;
  agent_id: string;
  acquired_at: string;
  expires_at: string;
}

function rowToLease(row: LeaseRow): LeaseRecord {
  return {
    taskId: row.task_id,
    agentId: row.agent_id,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

export class SqliteLeaseRepository {
  constructor(private readonly db: Database.Database) {}

  acquire(
    taskId: string,
    agentId: string,
    acquiredAt: string,
    expiresAt: string,
  ): LeaseRecord {
    const doAcquire = this.db.transaction(() => {
      // Clean up expired leases for this task
      this.db
        .prepare('DELETE FROM leases WHERE task_id = ? AND expires_at < ?')
        .run(taskId, acquiredAt);

      // Check for existing active lease
      const existing = this.getByTaskId(taskId);
      if (existing && existing.agentId !== agentId) {
        throw new LeaseConflictError(taskId, existing.agentId);
      }

      // Upsert lease
      this.db
        .prepare(
          `INSERT INTO leases (task_id, agent_id, acquired_at, expires_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(task_id) DO UPDATE SET
             agent_id = excluded.agent_id,
             acquired_at = excluded.acquired_at,
             expires_at = excluded.expires_at`,
        )
        .run(taskId, agentId, acquiredAt, expiresAt);

      return { taskId, agentId, acquiredAt, expiresAt };
    });

    return doAcquire();
  }

  release(taskId: string, agentId: string): void {
    const existing = this.getByTaskId(taskId);
    if (!existing) {
      return; // No lease to release
    }
    if (existing.agentId !== agentId) {
      throw new LeaseNotHeldError(taskId, agentId);
    }

    this.db.prepare('DELETE FROM leases WHERE task_id = ?').run(taskId);
  }

  getByTaskId(taskId: string): LeaseRecord | null {
    const row = this.db
      .prepare('SELECT * FROM leases WHERE task_id = ?')
      .get(taskId) as LeaseRow | undefined;

    return row ? rowToLease(row) : null;
  }

  expireStale(now: string): number {
    const result = this.db
      .prepare('DELETE FROM leases WHERE expires_at < ?')
      .run(now);

    return result.changes;
  }
}
