import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/persistence/connection.js';
import {
  migrateUp,
  migrateDown,
  getMigrationStatus,
  validateChecksums,
  computeChecksum,
} from '../../src/persistence/migration-engine.js';
import { MIGRATIONS } from '../../src/persistence/migrations.js';
import type { Migration } from '../../src/persistence/migration-engine.js';

describe('migration-engine', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  describe('computeChecksum', () => {
    it('should produce consistent checksums for the same SQL', () => {
      const sql = 'CREATE TABLE foo (id TEXT PRIMARY KEY);';
      expect(computeChecksum(sql)).toBe(computeChecksum(sql));
    });

    it('should differ for different SQL', () => {
      const a = computeChecksum('CREATE TABLE foo (id TEXT);');
      const b = computeChecksum('CREATE TABLE bar (id TEXT);');
      expect(a).not.toBe(b);
    });

    it('should trim whitespace for comparison', () => {
      expect(computeChecksum('  SELECT 1  ')).toBe(
        computeChecksum('SELECT 1'),
      );
    });

    it('should return a 16-char hex string', () => {
      const checksum = computeChecksum('SELECT 1');
      expect(checksum).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('migrateUp', () => {
    it('should apply all migrations to a fresh database', () => {
      db = createDatabase(':memory:');
      const applied = migrateUp(db, MIGRATIONS);

      expect(applied).toBe(6);

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);

      expect(names).toContain('task_records');
      expect(names).toContain('orchestrator_state');
      expect(names).toContain('event_log');
      expect(names).toContain('leases');
      expect(names).toContain('ext_requests');
      expect(names).toContain('spawn_queue');
      expect(names).toContain('budget_records');
      expect(names).toContain('metrics_aggregated');
      expect(names).toContain('schema_migrations');
    });

    it('should be idempotent', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);
      const applied = migrateUp(db, MIGRATIONS);

      expect(applied).toBe(0);
    });

    it('should record checksums for each migration', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      const records = db
        .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
        .all() as { version: number; checksum: string }[];

      expect(records).toHaveLength(6);
      for (const r of records) {
        expect(r.checksum).toMatch(/^[0-9a-f]{16}$/);
      }
    });

    it('should apply partial migrations when some already exist', () => {
      db = createDatabase(':memory:');
      const partial = MIGRATIONS.slice(0, 3);
      migrateUp(db, partial);

      const status1 = getMigrationStatus(db, MIGRATIONS);
      expect(status1.currentVersion).toBe(3);

      const applied = migrateUp(db, MIGRATIONS);
      expect(applied).toBe(3);

      const status2 = getMigrationStatus(db, MIGRATIONS);
      expect(status2.currentVersion).toBe(6);
    });

    it('should maintain backward-compatible schema_version table', () => {
      db = createDatabase(':memory:');
      // Simulate old system: create schema_version first
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      migrateUp(db, MIGRATIONS);

      // Old table should also be populated
      const oldRows = db
        .prepare('SELECT version FROM schema_version ORDER BY version')
        .all() as { version: number }[];
      expect(oldRows).toHaveLength(6);
      expect(oldRows[5].version).toBe(6);
    });
  });

  describe('migrateDown', () => {
    it('should rollback all migrations to version 0', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      const rolledBack = migrateDown(db, MIGRATIONS, 0);
      expect(rolledBack).toBe(6);

      const status = getMigrationStatus(db, MIGRATIONS);
      expect(status.currentVersion).toBe(0);
      expect(status.applied).toHaveLength(0);
    });

    it('should rollback to a specific version', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      const rolledBack = migrateDown(db, MIGRATIONS, 3);
      expect(rolledBack).toBe(3);

      const status = getMigrationStatus(db, MIGRATIONS);
      expect(status.currentVersion).toBe(3);
      expect(status.applied).toHaveLength(3);

      // v4-v6 tables should be gone
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).not.toContain('spawn_queue');
      expect(names).not.toContain('budget_records');
      expect(names).not.toContain('metrics_aggregated');

      // v1-v3 tables should remain
      expect(names).toContain('task_records');
      expect(names).toContain('event_log');
    });

    it('should return 0 when nothing to rollback', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      const rolledBack = migrateDown(db, MIGRATIONS, 6);
      expect(rolledBack).toBe(0);
    });

    it('should rollback v3 (pipeline_stage column) correctly', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      // Insert test data with pipeline_stage
      db.prepare(
        `INSERT INTO task_records (id, title, status, scope, created_at, updated_at, pipeline_stage)
         VALUES ('t1', 'Test', 'backlog', 'minor', datetime('now'), datetime('now'), 'qa')`,
      ).run();

      migrateDown(db, MIGRATIONS, 2);

      // pipeline_stage column should be gone
      const cols = db
        .prepare('PRAGMA table_info(task_records)')
        .all() as { name: string }[];
      const colNames = cols.map((c) => c.name);
      expect(colNames).not.toContain('pipeline_stage');

      // Data should still exist (minus pipeline_stage)
      const row = db
        .prepare('SELECT id, title FROM task_records WHERE id = ?')
        .get('t1') as { id: string; title: string };
      expect(row.title).toBe('Test');
    });

    it('should rollback v3 safely when ext_requests has rows (FK path)', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      // Insert a task and an ext_requests row referencing it
      db.prepare(
        `INSERT INTO task_records (id, title, status, scope, created_at, updated_at, pipeline_stage)
         VALUES ('t1', 'FK-Test', 'backlog', 'minor', datetime('now'), datetime('now'), 'dev')`,
      ).run();
      db.prepare(
        `INSERT INTO ext_requests (request_id, task_id, tool, payload_hash, response, created_at)
         VALUES ('r1', 't1', 'test-tool', 'hash1', '{}', datetime('now'))`,
      ).run();

      // Rollback v3 should succeed despite ext_requests FK to task_records
      migrateDown(db, MIGRATIONS, 2);

      // pipeline_stage column should be gone
      const cols = db
        .prepare('PRAGMA table_info(task_records)')
        .all() as { name: string }[];
      expect(cols.map((c) => c.name)).not.toContain('pipeline_stage');

      // ext_requests row should still exist (FK integrity preserved)
      const extRow = db
        .prepare('SELECT request_id FROM ext_requests WHERE request_id = ?')
        .get('r1') as { request_id: string } | undefined;
      expect(extRow?.request_id).toBe('r1');
    });

    it('should allow re-applying after rollback (round trip)', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      migrateDown(db, MIGRATIONS, 0);
      const applied = migrateUp(db, MIGRATIONS);
      expect(applied).toBe(6);

      const status = getMigrationStatus(db, MIGRATIONS);
      expect(status.currentVersion).toBe(6);
    });

    it('should roll back each individual migration', () => {
      for (let v = 1; v <= MIGRATIONS.length; v++) {
        const testDb = createDatabase(':memory:');
        const subset = MIGRATIONS.slice(0, v);
        migrateUp(testDb, subset);

        const rolledBack = migrateDown(testDb, subset, v - 1);
        expect(rolledBack).toBe(1);

        // Re-apply should work
        const reApplied = migrateUp(testDb, subset);
        expect(reApplied).toBe(1);

        testDb.close();
      }
    });

    it('should throw when migration definition is missing', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      // Try to rollback with an empty set of migration definitions
      expect(() => migrateDown(db, [], 0)).toThrow(
        'migration definition not found',
      );
    });
  });

  describe('getMigrationStatus', () => {
    it('should report all pending on a fresh database', () => {
      db = createDatabase(':memory:');
      const status = getMigrationStatus(db, MIGRATIONS);

      expect(status.currentVersion).toBe(0);
      expect(status.pending).toHaveLength(6);
      expect(status.applied).toHaveLength(0);
    });

    it('should report correct state after partial migration', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS.slice(0, 4));

      const status = getMigrationStatus(db, MIGRATIONS);
      expect(status.currentVersion).toBe(4);
      expect(status.applied).toHaveLength(4);
      expect(status.pending).toHaveLength(2);
    });
  });

  describe('validateChecksums', () => {
    it('should pass when checksums match', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      expect(() => validateChecksums(db, MIGRATIONS)).not.toThrow();
    });

    it('should throw when a migration has been modified', () => {
      db = createDatabase(':memory:');
      migrateUp(db, MIGRATIONS);

      const tampered: Migration[] = MIGRATIONS.map((m) =>
        m.version === 2
          ? { ...m, up: m.up + '\n-- tampered' }
          : m,
      );

      expect(() => validateChecksums(db, tampered)).toThrow(
        'has been modified',
      );
    });

    it('should skip legacy checksums from old schema_version migration', () => {
      db = createDatabase(':memory:');
      // Simulate old system
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO schema_version (version) VALUES (1);
      `);
      // Apply core schema manually
      db.exec(MIGRATIONS[0].up);

      // Trigger tracking table creation (will import old data as 'legacy')
      getMigrationStatus(db, MIGRATIONS);

      // Should not throw for legacy checksum
      expect(() => validateChecksums(db, MIGRATIONS)).not.toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('should upgrade from old schema_version tracking', () => {
      db = createDatabase(':memory:');

      // Simulate pre-EP17 database with old schema_version
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      // Apply migrations 1-4 the old way
      for (const m of MIGRATIONS.slice(0, 4)) {
        db.exec(m.up);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
      }

      // Now use new engine to apply remaining migrations
      const applied = migrateUp(db, MIGRATIONS);
      expect(applied).toBe(2); // v5 and v6

      const status = getMigrationStatus(db, MIGRATIONS);
      expect(status.currentVersion).toBe(6);
      expect(status.applied).toHaveLength(6);
    });
  });
});
