import type Database from 'better-sqlite3';
import { createDatabase } from '../src/persistence/connection.js';
import { runMigrations } from '../src/persistence/migrations.js';

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Use for integration tests.
 */
export function createTestDatabase(): Database.Database {
  const db = createDatabase(':memory:');
  runMigrations(db);
  return db;
}
