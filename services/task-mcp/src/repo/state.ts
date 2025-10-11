import Database from 'better-sqlite3';
import { ulid } from 'ulid';

export interface OrchestratorState {
  task_id: string;
  current: 'po' | 'arch' | 'dev' | 'review' | 'po_check' | 'qa' | 'pr' | 'done';
  previous?: 'po' | 'arch' | 'dev' | 'review' | 'po_check' | 'qa' | 'pr' | 'done';
  last_agent?: string;
  rounds_review: number;
  rev: number;
  updated_at: string;
}

export interface StateEvent {
  id: string;
  task_id: string;
  type: 'handoff' | 'transition' | 'comment' | 'quality' | 'error' | 'fasttrack';
  payload: Record<string, any>;
  created_at: string;
}

export interface Lease {
  task_id: string;
  lease_id: string;
  owner_agent: string;
  expires_at: string;
}

export class StateRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(taskId: string): OrchestratorState {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO orchestrator_state (task_id, current, rounds_review, rev, updated_at)
      VALUES (?, 'po', 0, 0, ?)
    `);
    insert.run(taskId, now);
    return {
      task_id: taskId,
      current: 'po',
      rounds_review: 0,
      rev: 0,
      updated_at: now
    };
  }

  get(taskId: string): OrchestratorState | null {
    const stmt = this.db.prepare('SELECT * FROM orchestrator_state WHERE task_id = ?');
    const row = stmt.get(taskId) as any;
    if (!row) return null;
    return {
      task_id: row.task_id,
      current: row.current,
      previous: row.previous,
      last_agent: row.last_agent,
      rounds_review: row.rounds_review,
      rev: row.rev,
      updated_at: row.updated_at
    };
  }

  update(taskId: string, ifRev: number, patch: Partial<OrchestratorState>): OrchestratorState {
    const current = this.get(taskId);
    if (!current) throw new Error('State not found');
    if (current.rev !== ifRev) throw new Error('Optimistic lock failed');

    const updated = {
      ...current,
      ...patch,
      rev: current.rev + 1,
      updated_at: new Date().toISOString()
    };

    const updateStmt = this.db.prepare(`
      UPDATE orchestrator_state SET
        current = ?, previous = ?, last_agent = ?, rounds_review = ?, rev = ?, updated_at = ?
      WHERE task_id = ?
    `);
    updateStmt.run(
      updated.current,
      updated.previous || null,
      updated.last_agent || null,
      updated.rounds_review,
      updated.rev,
      updated.updated_at,
      taskId
    );

    return updated;
  }

  delete(taskId: string): void {
    const stmt = this.db.prepare('DELETE FROM orchestrator_state WHERE task_id = ?');
    stmt.run(taskId);
  }
}

export class EventRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  append(taskId: string, type: StateEvent['type'], payload: Record<string, any>): StateEvent {
    const id = `EV-${ulid()}`;
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO event_log (id, task_id, type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run(id, taskId, type, JSON.stringify(payload), now);
    return {
      id,
      task_id: taskId,
      type,
      payload,
      created_at: now
    };
  }

  getByTaskId(taskId: string, limit: number = 50): StateEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM event_log WHERE task_id = ? ORDER BY created_at DESC LIMIT ?
    `);
    const rows = stmt.all(taskId, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      task_id: row.task_id,
      type: row.type,
      payload: JSON.parse(row.payload_json),
      created_at: row.created_at
    }));
  }

  search(taskId?: string, type?: string, limit: number = 100): StateEvent[] {
    let sql = 'SELECT * FROM event_log WHERE 1=1';
    const params: any[] = [];

    if (taskId) {
      sql += ' AND task_id = ?';
      params.push(taskId);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      task_id: row.task_id,
      type: row.type,
      payload: JSON.parse(row.payload_json),
      created_at: row.created_at
    }));
  }
}

export class LeaseRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  acquire(taskId: string, ownerAgent: string, ttlSeconds: number): Lease {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const leaseId = `LE-${ulid()}`;

    // Check for existing lease
    const existing = this.get(taskId);
    if (existing && existing.owner_agent !== ownerAgent) {
      // Check if expired
      if (new Date(existing.expires_at) > now) {
        throw new Error('Lease held by another agent');
      }
    }

    // Insert or replace lease
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO leases (task_id, lease_id, owner_agent, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    insert.run(taskId, leaseId, ownerAgent, expiresAt);

    return {
      task_id: taskId,
      lease_id: leaseId,
      owner_agent: ownerAgent,
      expires_at: expiresAt
    };
  }

  get(taskId: string): Lease | null {
    const stmt = this.db.prepare('SELECT * FROM leases WHERE task_id = ?');
    const row = stmt.get(taskId) as any;
    if (!row) return null;
    return {
      task_id: row.task_id,
      lease_id: row.lease_id,
      owner_agent: row.owner_agent,
      expires_at: row.expires_at
    };
  }

  release(taskId: string, leaseId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM leases WHERE task_id = ? AND lease_id = ?');
    const result = stmt.run(taskId, leaseId);
    return result.changes > 0;
  }

  cleanupExpired(): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('DELETE FROM leases WHERE expires_at < ?');
    const result = stmt.run(now);
    return result.changes;
  }

  isValid(taskId: string, leaseId?: string): boolean {
    const lease = this.get(taskId);
    if (!lease) return false;
    if (leaseId && lease.lease_id !== leaseId) return false;
    return new Date(lease.expires_at) > new Date();
  }
}