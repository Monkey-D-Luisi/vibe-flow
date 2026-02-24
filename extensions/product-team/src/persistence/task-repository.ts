import type Database from 'better-sqlite3';
import type { TaskRecord, OrchestratorState } from '../domain/task-record.js';
import type { TaskStatus } from '../domain/task-status.js';
import { TaskNotFoundError, StaleRevisionError } from '../domain/errors.js';

export interface SearchFilters {
  status?: TaskStatus;
  assignee?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  scope: string;
  assignee: string | null;
  tags: string;
  metadata: string;
  created_at: string;
  updated_at: string;
  rev: number;
}

function rowToTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status as TaskStatus,
    scope: row.scope as TaskRecord['scope'],
    assignee: row.assignee,
    tags: JSON.parse(row.tags) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev,
  };
}

export class SqliteTaskRepository {
  constructor(private readonly db: Database.Database) {}

  create(task: TaskRecord, orchState: OrchestratorState): TaskRecord {
    const insertBoth = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO task_records (id, title, status, scope, assignee, tags, metadata, created_at, updated_at, rev)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          task.id,
          task.title,
          task.status,
          task.scope,
          task.assignee,
          JSON.stringify(task.tags),
          JSON.stringify(task.metadata),
          task.createdAt,
          task.updatedAt,
          task.rev,
        );

      this.db
        .prepare(
          `INSERT INTO orchestrator_state (task_id, current, previous, last_agent, rounds_review, rev, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          orchState.taskId,
          orchState.current,
          orchState.previous,
          orchState.lastAgent,
          orchState.roundsReview,
          orchState.rev,
          orchState.updatedAt,
        );
    });

    insertBoth();
    return task;
  }

  getById(id: string): TaskRecord | null {
    const row = this.db
      .prepare('SELECT * FROM task_records WHERE id = ?')
      .get(id) as TaskRow | undefined;

    return row ? rowToTask(row) : null;
  }

  search(filters: SearchFilters): TaskRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.assignee) {
      conditions.push('assignee = ?');
      params.push(filters.assignee);
    }

    if (filters.tags && filters.tags.length > 0) {
      for (const tag of filters.tags) {
        conditions.push(
          'EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)',
        );
        params.push(tag);
      }
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM task_records ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as TaskRow[];

    return rows.map(rowToTask);
  }

  update(
    id: string,
    fields: Partial<Pick<TaskRecord, 'title' | 'scope' | 'assignee' | 'tags' | 'metadata' | 'status'>>,
    expectedRev: number,
    now: string,
  ): TaskRecord {
    const setClauses: string[] = ['updated_at = ?', 'rev = rev + 1'];
    const params: unknown[] = [now];

    if (fields.title !== undefined) {
      setClauses.push('title = ?');
      params.push(fields.title);
    }
    if (fields.scope !== undefined) {
      setClauses.push('scope = ?');
      params.push(fields.scope);
    }
    if (fields.assignee !== undefined) {
      setClauses.push('assignee = ?');
      params.push(fields.assignee);
    }
    if (fields.tags !== undefined) {
      setClauses.push('tags = ?');
      params.push(JSON.stringify(fields.tags));
    }
    if (fields.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(fields.metadata));
    }
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      params.push(fields.status);
    }

    params.push(id, expectedRev);

    const result = this.db
      .prepare(
        `UPDATE task_records SET ${setClauses.join(', ')} WHERE id = ? AND rev = ?`,
      )
      .run(...params);

    if (result.changes === 0) {
      const existing = this.getById(id);
      if (!existing) {
        throw new TaskNotFoundError(id);
      }
      throw new StaleRevisionError(id, expectedRev, existing.rev);
    }

    return this.getById(id)!;
  }
}
