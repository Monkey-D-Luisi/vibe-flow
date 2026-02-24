import type Database from 'better-sqlite3';

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_records (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'backlog',
  scope       TEXT NOT NULL DEFAULT 'minor',
  assignee    TEXT,
  tags        TEXT NOT NULL DEFAULT '[]',
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  rev         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_task_records_status ON task_records(status);
CREATE INDEX IF NOT EXISTS idx_task_records_assignee ON task_records(assignee);

CREATE TABLE IF NOT EXISTS orchestrator_state (
  task_id       TEXT PRIMARY KEY REFERENCES task_records(id),
  current       TEXT NOT NULL DEFAULT 'backlog',
  previous      TEXT,
  last_agent    TEXT,
  rounds_review INTEGER NOT NULL DEFAULT 0,
  rev           INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES task_records(id),
  event_type  TEXT NOT NULL,
  agent_id    TEXT,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_task_id ON event_log(task_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);

CREATE TABLE IF NOT EXISTS leases (
  task_id     TEXT PRIMARY KEY REFERENCES task_records(id),
  agent_id    TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
`;

const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS ext_requests (
  request_id   TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES task_records(id),
  tool         TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE(tool, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_ext_requests_task ON ext_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_ext_requests_lookup ON ext_requests(tool, payload_hash);
`;

interface Migration {
  readonly version: number;
  readonly sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
];

/**
 * Run pending database migrations.
 * Tracks applied versions in the schema_version table.
 */
export function runMigrations(db: Database.Database): void {
  // Ensure schema_version exists first (before any transaction)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = (
    db.prepare('SELECT MAX(version) as v FROM schema_version').get() as
      | { v: number | null }
      | undefined
  )?.v ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
        migration.version,
      );
    }
  });

  applyAll();
}
