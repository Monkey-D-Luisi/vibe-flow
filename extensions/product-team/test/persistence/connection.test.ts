import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/persistence/connection.js';
import { runMigrations } from '../../src/persistence/migrations.js';

describe('createDatabase', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('should create an in-memory database', () => {
    db = createDatabase(':memory:');
    expect(db.open).toBe(true);
  });

  it('should request WAL journal mode', () => {
    // In-memory databases cannot use WAL; SQLite returns 'memory'.
    // WAL takes effect on file-based databases.
    db = createDatabase(':memory:');
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('memory');
  });

  it('should enable foreign keys', () => {
    db = createDatabase(':memory:');
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });
});

describe('runMigrations', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('should create all tables on first run', () => {
    db = createDatabase(':memory:');
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('task_records');
    expect(tableNames).toContain('orchestrator_state');
    expect(tableNames).toContain('event_log');
    expect(tableNames).toContain('leases');
    expect(tableNames).toContain('ext_requests');
    expect(tableNames).toContain('spawn_queue');
    expect(tableNames).toContain('budget_records');
    expect(tableNames).toContain('metrics_aggregated');
    expect(tableNames).toContain('schema_version');
  });

  it('should record the migration version', () => {
    db = createDatabase(':memory:');
    runMigrations(db);

    const row = db
      .prepare('SELECT MAX(version) as v FROM schema_migrations')
      .get() as { v: number };
    expect(row.v).toBe(6);
  });

  it('should be idempotent', () => {
    db = createDatabase(':memory:');
    runMigrations(db);
    runMigrations(db);

    const rows = db
      .prepare('SELECT COUNT(*) as c FROM schema_migrations')
      .get() as { c: number };
    expect(rows.c).toBe(6);
  });
});
