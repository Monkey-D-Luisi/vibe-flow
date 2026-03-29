import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

/**
 * A reversible database migration with up/down SQL statements.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
  readonly down: string;
}

/**
 * Row in the schema_migrations tracking table.
 */
export interface MigrationRecord {
  readonly version: number;
  readonly name: string;
  readonly applied_at: string;
  readonly checksum: string;
}

/**
 * Result of a migration status check.
 */
export interface MigrationStatus {
  readonly currentVersion: number;
  readonly pending: readonly Migration[];
  readonly applied: readonly MigrationRecord[];
}

const TRACKING_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
    checksum    TEXT NOT NULL
  );
`;

/**
 * Compute a SHA-256 checksum for a migration's up SQL.
 * Used to detect modifications to already-applied migrations.
 */
export function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex').slice(0, 16);
}

/**
 * Ensure the tracking table exists and migrate from old schema_version
 * table if present (backward compatibility with pre-EP17 databases).
 */
function ensureTrackingTable(
  db: Database.Database,
  migrations: readonly Migration[],
): void {
  db.exec(TRACKING_TABLE_DDL);

  // Backward compatibility: migrate from old schema_version table
  const hasOldTable = db
    .prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get() as { c: number };

  if (hasOldTable.c === 0) return;

  const hasNewData = db
    .prepare('SELECT COUNT(*) as c FROM schema_migrations')
    .get() as { c: number };

  if (hasNewData.c > 0) return;

  // Copy old version data into new tracking table
  const oldVersions = db
    .prepare('SELECT version, applied_at FROM schema_version ORDER BY version')
    .all() as { version: number; applied_at: string }[];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
  );

  for (const row of oldVersions) {
    const migration = migrations.find((m) => m.version === row.version);
    const name = migration?.name ?? `migration-v${row.version}`;
    const checksum = migration ? computeChecksum(migration.up) : 'legacy';
    insert.run(row.version, name, row.applied_at, checksum);
  }
}

/**
 * Get the current migration status: applied versions, current version,
 * and pending migrations.
 */
export function getMigrationStatus(
  db: Database.Database,
  migrations: readonly Migration[],
): MigrationStatus {
  ensureTrackingTable(db, migrations);

  const applied = db
    .prepare(
      'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version',
    )
    .all() as MigrationRecord[];

  const currentVersion =
    applied.length > 0 ? applied[applied.length - 1].version : 0;

  const pending = migrations.filter((m) => m.version > currentVersion);

  return { currentVersion, pending, applied };
}

/**
 * Validate that applied migrations have not been modified since they were applied.
 * Throws if any checksum mismatches are detected (ignoring legacy checksums).
 */
export function validateChecksums(
  db: Database.Database,
  migrations: readonly Migration[],
): void {
  const { applied } = getMigrationStatus(db, migrations);

  for (const record of applied) {
    if (record.checksum === 'legacy') continue;
    const migration = migrations.find((m) => m.version === record.version);
    if (!migration) continue;
    const expected = computeChecksum(migration.up);
    if (record.checksum !== expected) {
      throw new Error(
        `Migration v${record.version} (${record.name}) has been modified after application. ` +
          `Expected checksum ${record.checksum}, got ${expected}.`,
      );
    }
  }
}

/**
 * Apply all pending migrations (up direction).
 * Each migration runs in its own transaction for isolation.
 */
export function migrateUp(
  db: Database.Database,
  migrations: readonly Migration[],
): number {
  ensureTrackingTable(db, migrations);

  const { pending } = getMigrationStatus(db, migrations);
  if (pending.length === 0) return 0;

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, datetime(\'now\'), ?)',
  );

  // Also insert into old schema_version table for backward compatibility
  const hasOldTable = db
    .prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get() as { c: number };

  const insertOld = hasOldTable.c > 0
    ? db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)')
    : undefined;

  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.up);
      insert.run(
        migration.version,
        migration.name,
        computeChecksum(migration.up),
      );
      insertOld?.run(migration.version);
    });
    apply();
  }

  return pending.length;
}

/**
 * Rollback migrations down to the specified target version (exclusive).
 * If targetVersion is 0, all migrations are rolled back.
 * Each rollback runs in its own transaction.
 */
export function migrateDown(
  db: Database.Database,
  migrations: readonly Migration[],
  targetVersion: number,
): number {
  ensureTrackingTable(db, migrations);

  const { applied } = getMigrationStatus(db, migrations);
  const toRollback = applied
    .filter((r) => r.version > targetVersion)
    .sort((a, b) => b.version - a.version); // Rollback in reverse order

  if (toRollback.length === 0) return 0;

  const remove = db.prepare(
    'DELETE FROM schema_migrations WHERE version = ?',
  );

  for (const record of toRollback) {
    const migration = migrations.find((m) => m.version === record.version);
    if (!migration) {
      throw new Error(
        `Cannot rollback migration v${record.version}: migration definition not found.`,
      );
    }

    const rollback = db.transaction(() => {
      db.exec(migration.down);
      remove.run(migration.version);

      // Check if old schema_version table still exists before deleting
      // (v1 down migration drops it, so we must re-check each iteration)
      const oldTableExists = db
        .prepare(
          "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='schema_version'",
        )
        .get() as { c: number };
      if (oldTableExists.c > 0) {
        db.prepare('DELETE FROM schema_version WHERE version = ?').run(
          migration.version,
        );
      }
    });
    rollback();
  }

  return toRollback.length;
}
