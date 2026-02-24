import type Database from 'better-sqlite3';

export interface RequestRecord {
  readonly requestId: string;
  readonly taskId: string;
  readonly tool: string;
  readonly payloadHash: string;
  readonly response: string;
  readonly createdAt: string;
}

interface RequestRow {
  request_id: string;
  task_id: string;
  tool: string;
  payload_hash: string;
  response: string;
  created_at: string;
}

function rowToRecord(row: RequestRow): RequestRecord {
  return {
    requestId: row.request_id,
    taskId: row.task_id,
    tool: row.tool,
    payloadHash: row.payload_hash,
    response: row.response,
    createdAt: row.created_at,
  };
}

export class SqliteRequestRepository {
  constructor(private readonly db: Database.Database) {}

  findByPayloadHash(tool: string, payloadHash: string): RequestRecord | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM ext_requests
         WHERE tool = ? AND payload_hash = ?
         LIMIT 1`,
      )
      .get(tool, payloadHash) as RequestRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  findLatestByTaskAndTool(taskId: string, tool: string): RequestRecord | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM ext_requests
         WHERE task_id = ? AND tool = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(taskId, tool) as RequestRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  insert(record: RequestRecord): void {
    this.db
      .prepare(
        `INSERT INTO ext_requests (request_id, task_id, tool, payload_hash, response, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.requestId,
        record.taskId,
        record.tool,
        record.payloadHash,
        record.response,
        record.createdAt,
      );
  }
}
