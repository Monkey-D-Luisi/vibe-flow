import Database from 'better-sqlite3';

/**
 * Create and configure a better-sqlite3 database connection.
 * Enables WAL mode, foreign keys, and sets a busy timeout.
 */
export function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
