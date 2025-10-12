import Database from 'better-sqlite3';
import { TaskRecord } from '../domain/TaskRecord.js';
import { MIGRATION_SQL, prepareInsertTask, prepareSelectTaskById, prepareUpdateTask, prepareSearchTasks, prepareCountTasks, SEARCH_TASKS_SQL_BASE, COUNT_TASKS_SQL_BASE } from './statements.js';
import { rowToRecord, recordToParams, updatedRecordToParams } from './row-mapper.js';
import { TaskNotFoundError, OptimisticLockError, ensureTaskExists, withOptimisticLock } from './guards.js';

export { TaskNotFoundError, OptimisticLockError } from './guards.js';

function buildSearchQuery(query: { q?: string; status?: string[]; labels?: string[]; limit?: number; offset?: number }): { sql: string; countSql: string; params: any[] } {
  let sql = SEARCH_TASKS_SQL_BASE;
  let countSql = COUNT_TASKS_SQL_BASE;
  const params: any[] = [];

  if (query.q) {
    const qCondition = ' AND (title LIKE ? OR description LIKE ?)';
    sql += qCondition;
    countSql += qCondition;
    params.push(`%${query.q}%`, `%${query.q}%`);
  }
  if (query.status && query.status.length > 0) {
    const statusCondition = ` AND status IN (${query.status.map(() => '?').join(',')})`;
    sql += statusCondition;
    countSql += statusCondition;
    params.push(...query.status);
  }
  if (query.labels && query.labels.length > 0) {
    const labelsCondition = ` AND EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value IN (${query.labels.map(() => '?').join(',')}))`;
    sql += labelsCondition;
    countSql += labelsCondition;
    params.push(...query.labels);
  }

  sql += ' ORDER BY created_at DESC';
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }
  if (query.offset) {
    sql += ' OFFSET ?';
    params.push(query.offset);
  }

  return { sql, countSql, params };
}

export class TaskRepository {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.migrate();
  }

  get database(): Database.Database {
    return this.db;
  }

  private migrate() {
    // Enable WAL mode and foreign keys for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(MIGRATION_SQL);
  }

  create(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>): TaskRecord {
    const now = new Date().toISOString();
    const rev = 0;
    const params = recordToParams(record);
    params.push(rev, now, now); // Add rev, created_at, updated_at

    const insert = prepareInsertTask(this.db);
    insert.run(...params);
    return { ...record, rev, created_at: now, updated_at: now };
  }

  get(id: string): TaskRecord | null {
    const stmt = prepareSelectTaskById(this.db);
    const row = stmt.get(id) as any;
    if (!row) return null;
    return rowToRecord(row);
  }

  update(id: string, ifRev: number, patch: Partial<TaskRecord>): TaskRecord {
    return withOptimisticLock(this.db, id, ifRev, () => {
      const current = this.get(id);
      if (!current) throw new TaskNotFoundError(id);

      const updated = { ...current, ...patch, rev: current.rev + 1, updated_at: new Date().toISOString() };
      const params = updatedRecordToParams(updated);

      const updateStmt = prepareUpdateTask(this.db);
      updateStmt.run(...params);
      return updated;
    });
  }

  search(query: { q?: string; status?: string[]; labels?: string[]; limit?: number; offset?: number }): { items: TaskRecord[]; total: number } {
    const { sql, countSql, params } = buildSearchQuery(query);

    const countStmt = prepareCountTasks(this.db, countSql);
    const total = (countStmt.get(...params) as any).count;

    const stmt = prepareSearchTasks(this.db, sql);
    const rows = stmt.all(...params) as any[];
    const items = rows.map(row => rowToRecord(row));

    return { items, total };
  }

  close() {
    this.db.close();
  }
}