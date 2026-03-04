import type { ToolDeps } from './index.js';

export const MESSAGES_TABLE = 'agent_messages';

export function ensureMessagesTable(deps: ToolDeps): void {
  deps.db.exec(`
    CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      task_ref TEXT,
      reply_to TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      origin_channel TEXT,
      origin_session_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reply_to) REFERENCES ${MESSAGES_TABLE}(id)
    )
  `);

  // Migrate existing databases: add origin columns if they don't exist.
  // SQLite ALTER TABLE ADD COLUMN is safe — it errors if the column exists.
  try { deps.db.exec(`ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN origin_channel TEXT`); } catch { /* already exists */ }
  try { deps.db.exec(`ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN origin_session_key TEXT`); } catch { /* already exists */ }
}
