import type Database from 'better-sqlite3';

export interface EventRecord {
  readonly id: string;
  readonly taskId: string;
  readonly eventType: string;
  readonly agentId: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

interface EventRow {
  id: string;
  task_id: string;
  event_type: string;
  agent_id: string | null;
  payload: string;
  created_at: string;
}

function rowToEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    agentId: row.agent_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export class SqliteEventRepository {
  constructor(private readonly db: Database.Database) {}

  append(event: EventRecord): void {
    this.db
      .prepare(
        `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.taskId,
        event.eventType,
        event.agentId,
        JSON.stringify(event.payload),
        event.createdAt,
      );
  }

  getByTaskId(taskId: string): EventRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM event_log WHERE task_id = ? ORDER BY created_at ASC',
      )
      .all(taskId) as EventRow[];

    return rows.map(rowToEvent);
  }
}
