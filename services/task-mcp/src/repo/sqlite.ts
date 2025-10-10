import Database from 'better-sqlite3';
import { TaskRecord } from '../domain/TaskRecord.js';

export class TaskRepository {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.migrate();
  }

  private migrate() {
    const ddl = `
      CREATE TABLE IF NOT EXISTS task_records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        scope TEXT NOT NULL CHECK(scope IN ('minor','major')),
        status TEXT NOT NULL CHECK(status IN ('po','arch','dev','review','po_check','qa','pr','done')),
        adr_id TEXT,
        branch TEXT,
        coverage REAL DEFAULT 0 CHECK(coverage >= 0 AND coverage <= 1),
        lint_errors INTEGER DEFAULT 0 CHECK(lint_errors >= 0),
        lint_warnings INTEGER DEFAULT 0 CHECK(lint_warnings >= 0),
        rounds_review INTEGER DEFAULT 0,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        qa_report_json TEXT NOT NULL DEFAULT '{}',
        acceptance_json TEXT NOT NULL DEFAULT '[]',
        modules_json TEXT NOT NULL DEFAULT '[]',
        contracts_json TEXT NOT NULL DEFAULT '[]',
        patterns_json TEXT NOT NULL DEFAULT '[]',
        review_notes_json TEXT NOT NULL DEFAULT '[]',
        test_plan_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        links_json TEXT NOT NULL DEFAULT '{}',
        diff_summary TEXT,
        red_green_refactor_json TEXT NOT NULL DEFAULT '[]',
        rev INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_status ON task_records(status);
      CREATE INDEX IF NOT EXISTS idx_task_scope ON task_records(scope);
    `;
    this.db.exec(ddl);
  }

  create(record: Omit<TaskRecord, 'rev' | 'created_at' | 'updated_at'>): TaskRecord {
    const now = new Date().toISOString();
    const rev = 0;
    const insert = this.db.prepare(`
      INSERT INTO task_records (
        id, title, description, scope, status, adr_id, branch, coverage, lint_errors, lint_warnings,
        rounds_review, metrics_json, qa_report_json, acceptance_json, modules_json, contracts_json,
        patterns_json, review_notes_json, test_plan_json, tags_json, links_json, diff_summary,
        red_green_refactor_json, rev, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      record.id, record.title, record.description || null, record.scope, record.status,
      record.adr_id || null, record.branch || null,
      record.metrics?.coverage || 0, record.metrics?.lint?.errors || 0, record.metrics?.lint?.warnings || 0,
      record.rounds_review || 0,
      JSON.stringify(record.metrics || {}), JSON.stringify(record.qa_report || {}),
      JSON.stringify(record.acceptance_criteria), JSON.stringify(record.modules || []),
      JSON.stringify(record.contracts || []), JSON.stringify(record.patterns || []),
      JSON.stringify(record.review_notes || []), JSON.stringify(record.test_plan || []),
      JSON.stringify(record.tags || []), JSON.stringify(record.links || {}),
      record.diff_summary || null, JSON.stringify(record.red_green_refactor_log || []),
      rev, now, now
    );
    return { ...record, rev, created_at: now, updated_at: now };
  }

  get(id: string): TaskRecord | null {
    const stmt = this.db.prepare('SELECT * FROM task_records WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  update(id: string, ifRev: number, patch: Partial<TaskRecord>): TaskRecord {
    const current = this.get(id);
    if (!current) throw new Error('Task not found');
    if (current.rev !== ifRev) throw new Error('Optimistic lock failed');

    const updated = { ...current, ...patch, rev: current.rev + 1, updated_at: new Date().toISOString() };
    const updateStmt = this.db.prepare(`
      UPDATE task_records SET
        title = ?, description = ?, scope = ?, status = ?, adr_id = ?, branch = ?, coverage = ?,
        lint_errors = ?, lint_warnings = ?, rounds_review = ?, metrics_json = ?, qa_report_json = ?,
        acceptance_json = ?, modules_json = ?, contracts_json = ?, patterns_json = ?,
        review_notes_json = ?, test_plan_json = ?, tags_json = ?, links_json = ?, diff_summary = ?,
        red_green_refactor_json = ?, rev = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(
      updated.title, updated.description, updated.scope, updated.status, updated.adr_id, updated.branch,
      updated.metrics?.coverage, updated.metrics?.lint?.errors, updated.metrics?.lint?.warnings,
      updated.rounds_review, JSON.stringify(updated.metrics), JSON.stringify(updated.qa_report),
      JSON.stringify(updated.acceptance_criteria), JSON.stringify(updated.modules),
      JSON.stringify(updated.contracts), JSON.stringify(updated.patterns),
      JSON.stringify(updated.review_notes), JSON.stringify(updated.test_plan),
      JSON.stringify(updated.tags), JSON.stringify(updated.links), updated.diff_summary,
      JSON.stringify(updated.red_green_refactor_log), updated.rev, updated.updated_at, id
    );
    return updated;
  }

  search(query: { q?: string; status?: string[]; labels?: string[]; limit?: number; offset?: number }): { items: TaskRecord[]; total: number } {
    let sql = 'SELECT * FROM task_records WHERE 1=1';
    const params: any[] = [];

    if (query.q) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${query.q}%`, `%${query.q}%`);
    }
    if (query.status && query.status.length > 0) {
      sql += ` AND status IN (${query.status.map(() => '?').join(',')})`;
      params.push(...query.status);
    }
    if (query.labels && query.labels.length > 0) {
      // Assuming labels are in tags_json
      sql += ` AND EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value IN (${query.labels.map(() => '?').join(',')}))`;
      params.push(...query.labels);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countSql);
    const total = (countStmt.get(...params) as any).count;

    sql += ' ORDER BY created_at DESC';
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    const items = rows.map(row => this.rowToRecord(row));

    return { items, total };
  }

  private rowToRecord(row: any): TaskRecord {
    return {
      version: row.version,
      id: row.id,
      title: row.title,
      description: row.description,
      acceptance_criteria: JSON.parse(row.acceptance_json),
      scope: row.scope,
      modules: JSON.parse(row.modules_json),
      contracts: JSON.parse(row.contracts_json),
      patterns: JSON.parse(row.patterns_json),
      adr_id: row.adr_id,
      test_plan: JSON.parse(row.test_plan_json),
      branch: row.branch,
      diff_summary: row.diff_summary,
      review_notes: JSON.parse(row.review_notes_json),
      qa_report: JSON.parse(row.qa_report_json),
      metrics: {
        coverage: row.coverage,
        complexity: JSON.parse(row.metrics_json).complexity,
        lint: { errors: row.lint_errors, warnings: row.lint_warnings }
      },
      red_green_refactor_log: JSON.parse(row.red_green_refactor_json),
      status: row.status,
      rounds_review: row.rounds_review,
      links: JSON.parse(row.links_json),
      tags: JSON.parse(row.tags_json),
      rev: row.rev,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  close() {
    this.db.close();
  }
}