import Database from 'better-sqlite3';

export class OptimisticLockError extends Error {
  constructor(id: string, expectedRev: number) {
    super(`Optimistic lock failed for task ${id}, expected rev ${expectedRev}`);
    this.name = 'OptimisticLockError';
  }
}

export function ensureTaskExists(db: Database.Database, id: string): void {
  const stmt = db.prepare('SELECT 1 FROM task_records WHERE id = ?');
  if (!stmt.get(id)) {
    throw new Error('Task not found');
  }
}

export function checkRev(db: Database.Database, id: string, expectedRev: number): boolean {
  const stmt = db.prepare('SELECT rev FROM task_records WHERE id = ?');
  const row = stmt.get(id) as any;
  return row && row.rev === expectedRev;
}

export function withOptimisticLock<T>(db: Database.Database, id: string, rev: number, fn: () => T): T {
  if (!checkRev(db, id, rev)) {
    throw new OptimisticLockError(id, rev);
  }
  return fn();
}