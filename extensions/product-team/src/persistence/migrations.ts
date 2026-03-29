import type Database from 'better-sqlite3';
import type { Migration } from './migration-engine.js';
import { migrateUp } from './migration-engine.js';

const MIGRATION_001_UP = `
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

const MIGRATION_001_DOWN = `
DROP TABLE IF EXISTS leases;
DROP TABLE IF EXISTS event_log;
DROP TABLE IF EXISTS orchestrator_state;
DROP TABLE IF EXISTS ext_requests;
DROP TABLE IF EXISTS task_records;
DROP TABLE IF EXISTS schema_version;
`;

const MIGRATION_002_UP = `
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

const MIGRATION_002_DOWN = `
DROP TABLE IF EXISTS ext_requests;
`;

const MIGRATION_003_UP = `
-- EP09: Pipeline state indexing — promote pipeline stage from metadata JSON
-- to a dedicated indexed column for efficient stage-based queries.
ALTER TABLE task_records ADD COLUMN pipeline_stage TEXT;

CREATE INDEX IF NOT EXISTS idx_task_records_pipeline_stage ON task_records(pipeline_stage);
`;

const MIGRATION_003_DOWN = `
-- SQLite < 3.35.0 does not support DROP COLUMN.
-- Rebuild table without pipeline_stage column.
DROP INDEX IF EXISTS idx_task_records_pipeline_stage;

CREATE TABLE task_records_backup (
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

INSERT INTO task_records_backup
  SELECT id, title, status, scope, assignee, tags, metadata, created_at, updated_at, rev
  FROM task_records;

DROP TABLE task_records;

ALTER TABLE task_records_backup RENAME TO task_records;

CREATE INDEX IF NOT EXISTS idx_task_records_status ON task_records(status);
CREATE INDEX IF NOT EXISTS idx_task_records_assignee ON task_records(assignee);
`;

const MIGRATION_004_UP = `
-- EP09: Spawn retry queue for reliable agent spawning (Task 0066).
CREATE TABLE IF NOT EXISTS spawn_queue (
  id TEXT PRIMARY KEY,
  target_agent TEXT NOT NULL,
  message TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_spawn_queue_status ON spawn_queue(status);
`;

const MIGRATION_004_DOWN = `
DROP TABLE IF EXISTS spawn_queue;
`;

const MIGRATION_005_UP = `
-- EP11: Hard budget limits engine (Task 0084).
-- Hierarchical budget tracking: global > pipeline > stage > agent.
CREATE TABLE IF NOT EXISTS budget_records (
  id                TEXT PRIMARY KEY,
  scope             TEXT NOT NULL CHECK(scope IN ('global', 'pipeline', 'stage', 'agent')),
  scope_id          TEXT NOT NULL,
  limit_tokens      INTEGER NOT NULL DEFAULT 0,
  consumed_tokens   INTEGER NOT NULL DEFAULT 0,
  limit_usd         REAL NOT NULL DEFAULT 0.0,
  consumed_usd      REAL NOT NULL DEFAULT 0.0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'warning', 'exhausted')),
  warning_threshold REAL NOT NULL DEFAULT 0.8,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  rev               INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_records_scope ON budget_records(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_budget_records_status ON budget_records(status);
`;

const MIGRATION_005_DOWN = `
DROP TABLE IF EXISTS budget_records;
`;

const MIGRATION_006_UP = `
-- EP14: Metrics aggregation engine (Task 0099).
-- Pre-computed metrics from event_log for fast dashboards and /api/metrics.
CREATE TABLE IF NOT EXISTS metrics_aggregated (
  id           TEXT PRIMARY KEY,
  metric_type  TEXT NOT NULL,
  scope        TEXT NOT NULL,
  period       TEXT NOT NULL CHECK(period IN ('hour', 'day', 'all')),
  period_start TEXT NOT NULL,
  value_json   TEXT NOT NULL DEFAULT '{}',
  computed_at  TEXT NOT NULL,
  UNIQUE(metric_type, scope, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_metrics_agg_lookup
  ON metrics_aggregated(metric_type, scope, period, period_start);
`;

const MIGRATION_006_DOWN = `
DROP TABLE IF EXISTS metrics_aggregated;
`;

/**
 * All migrations in up/down reversible format.
 * Exported for use by the migration engine and tests.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'core-schema', up: MIGRATION_001_UP, down: MIGRATION_001_DOWN },
  { version: 2, name: 'ext-requests', up: MIGRATION_002_UP, down: MIGRATION_002_DOWN },
  { version: 3, name: 'pipeline-stage', up: MIGRATION_003_UP, down: MIGRATION_003_DOWN },
  { version: 4, name: 'spawn-queue', up: MIGRATION_004_UP, down: MIGRATION_004_DOWN },
  { version: 5, name: 'budget-records', up: MIGRATION_005_UP, down: MIGRATION_005_DOWN },
  { version: 6, name: 'metrics-aggregated', up: MIGRATION_006_UP, down: MIGRATION_006_DOWN },
];

/**
 * Run pending database migrations.
 * Backward-compatible wrapper that delegates to the migration engine.
 */
export function runMigrations(db: Database.Database): void {
  migrateUp(db, MIGRATIONS);
}
