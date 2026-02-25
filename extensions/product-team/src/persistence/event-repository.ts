import type Database from 'better-sqlite3';

export interface EventRecord {
  readonly id: string;
  readonly taskId: string;
  readonly eventType: string;
  readonly agentId: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface EventQueryFilters {
  readonly taskId?: string;
  readonly agentId?: string;
  readonly eventType?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface EventQueryAggregates {
  readonly byAgent: Record<string, number>;
  readonly byEventType: Record<string, number>;
  readonly avgCycleTimeMs: number | null;
}

export interface EventQueryResult {
  readonly events: EventRecord[];
  readonly total: number;
  readonly aggregates: EventQueryAggregates;
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

function buildWhereClause(filters: EventQueryFilters): {
  readonly clause: string;
  readonly params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.taskId) {
    conditions.push('task_id = ?');
    params.push(filters.taskId);
  }
  if (filters.agentId) {
    conditions.push('agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.eventType) {
    conditions.push('event_type = ?');
    params.push(filters.eventType);
  }
  if (filters.since) {
    conditions.push('created_at >= ?');
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push('created_at <= ?');
    params.push(filters.until);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
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

  queryEvents(filters: EventQueryFilters): EventQueryResult {
    const { clause, params } = buildWhereClause(filters);
    const rows = this.db
      .prepare(
        `SELECT * FROM event_log ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, filters.limit, filters.offset) as EventRow[];
    const events = rows.map(rowToEvent);

    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) as total FROM event_log ${clause}`,
      )
      .get(...params) as { total: number };

    const byAgentRows = this.db
      .prepare(
        `SELECT COALESCE(agent_id, 'system') as id, COUNT(*) as count
         FROM event_log ${clause}
         GROUP BY COALESCE(agent_id, 'system')`,
      )
      .all(...params) as Array<{ id: string; count: number }>;
    const byEventTypeRows = this.db
      .prepare(
        `SELECT event_type as id, COUNT(*) as count
         FROM event_log ${clause}
         GROUP BY event_type`,
      )
      .all(...params) as Array<{ id: string; count: number }>;

    const byAgent: Record<string, number> = {};
    for (const row of byAgentRows) {
      byAgent[row.id] = row.count;
    }

    const byEventType: Record<string, number> = {};
    for (const row of byEventTypeRows) {
      byEventType[row.id] = row.count;
    }

    const cycleSql = filters.taskId
      ? `
        SELECT
          CAST(AVG((julianday(done_at) - julianday(created_at)) * 86400000.0) AS REAL) as avg_ms
        FROM (
          SELECT
            task_id,
            MIN(CASE WHEN event_type = 'task.created' THEN created_at END) as created_at,
            MIN(CASE
              WHEN event_type = 'task.transition'
                AND json_extract(payload, '$.to') = 'done'
              THEN created_at
            END) as done_at
          FROM event_log
          WHERE task_id = ?
          GROUP BY task_id
        )
        WHERE created_at IS NOT NULL AND done_at IS NOT NULL
      `
      : `
        SELECT
          CAST(AVG((julianday(done_at) - julianday(created_at)) * 86400000.0) AS REAL) as avg_ms
        FROM (
          SELECT
            task_id,
            MIN(CASE WHEN event_type = 'task.created' THEN created_at END) as created_at,
            MIN(CASE
              WHEN event_type = 'task.transition'
                AND json_extract(payload, '$.to') = 'done'
              THEN created_at
            END) as done_at
          FROM event_log
          GROUP BY task_id
        )
        WHERE created_at IS NOT NULL AND done_at IS NOT NULL
      `;
    const cycleRow = filters.taskId
      ? this.db.prepare(cycleSql).get(filters.taskId) as { avg_ms: number | null }
      : this.db.prepare(cycleSql).get() as { avg_ms: number | null };

    return {
      events,
      total: totalRow.total,
      aggregates: {
        byAgent,
        byEventType,
        avgCycleTimeMs: cycleRow.avg_ms,
      },
    };
  }
}
