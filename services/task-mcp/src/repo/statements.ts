import Database from 'better-sqlite3';

export const MIGRATION_SQL = `
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

  -- Orchestrator state per Task
  CREATE TABLE IF NOT EXISTS orchestrator_state (
    task_id TEXT PRIMARY KEY REFERENCES task_records(id) ON DELETE CASCADE,
    current TEXT NOT NULL CHECK(current IN ('po','arch','dev','review','po_check','qa','pr','done')),
    previous TEXT,
    last_agent TEXT,
    rounds_review INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  -- Event journal
  CREATE TABLE IF NOT EXISTS event_log (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES task_records(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_task ON event_log(task_id);
  CREATE INDEX IF NOT EXISTS idx_event_created ON event_log(created_at);

  -- Leases for exclusion
  CREATE TABLE IF NOT EXISTS leases (
    task_id TEXT PRIMARY KEY REFERENCES task_records(id) ON DELETE CASCADE,
    lease_id TEXT NOT NULL,
    owner_agent TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);
`;

export const INSERT_TASK_SQL = `
  INSERT INTO task_records (
    id, title, description, scope, status, adr_id, branch, coverage, lint_errors, lint_warnings,
    rounds_review, metrics_json, qa_report_json, acceptance_json, modules_json, contracts_json,
    patterns_json, review_notes_json, test_plan_json, tags_json, links_json, diff_summary,
    red_green_refactor_json, rev, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SELECT_TASK_BY_ID_SQL = 'SELECT * FROM task_records WHERE id = ?';

export const UPDATE_TASK_SQL = `
  UPDATE task_records SET
    title = ?, description = ?, scope = ?, status = ?, adr_id = ?, branch = ?, coverage = ?,
    lint_errors = ?, lint_warnings = ?, rounds_review = ?, metrics_json = ?, qa_report_json = ?,
    acceptance_json = ?, modules_json = ?, contracts_json = ?, patterns_json = ?,
    review_notes_json = ?, test_plan_json = ?, tags_json = ?, links_json = ?, diff_summary = ?,
    red_green_refactor_json = ?, rev = ?, updated_at = ?
  WHERE id = ?
`;

export const SEARCH_TASKS_SQL_BASE = 'SELECT * FROM task_records WHERE 1=1';

export const COUNT_TASKS_SQL_BASE = 'SELECT COUNT(*) as count FROM task_records WHERE 1=1';

export function prepareInsertTask(db: Database.Database) {
  return db.prepare(INSERT_TASK_SQL);
}

export function prepareSelectTaskById(db: Database.Database) {
  return db.prepare(SELECT_TASK_BY_ID_SQL);
}

export function prepareUpdateTask(db: Database.Database) {
  return db.prepare(UPDATE_TASK_SQL);
}

export function prepareSearchTasks(db: Database.Database, sql: string) {
  return db.prepare(sql);
}

export function prepareCountTasks(db: Database.Database, sql: string) {
  return db.prepare(sql);
}