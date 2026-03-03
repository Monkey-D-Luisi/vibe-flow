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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reply_to) REFERENCES ${MESSAGES_TABLE}(id)
    )
  `);
}
