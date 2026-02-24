import type Database from 'better-sqlite3';
import type { OrchestratorState } from '../domain/task-record.js';
import type { TaskStatus } from '../domain/task-status.js';
import { TaskNotFoundError, StaleRevisionError } from '../domain/errors.js';

interface OrchestratorRow {
  task_id: string;
  current: string;
  previous: string | null;
  last_agent: string | null;
  rounds_review: number;
  rev: number;
  updated_at: string;
}

function rowToState(row: OrchestratorRow): OrchestratorState {
  return {
    taskId: row.task_id,
    current: row.current as TaskStatus,
    previous: (row.previous as TaskStatus) ?? null,
    lastAgent: row.last_agent,
    roundsReview: row.rounds_review,
    rev: row.rev,
    updatedAt: row.updated_at,
  };
}

export class SqliteOrchestratorRepository {
  constructor(private readonly db: Database.Database) {}

  getByTaskId(taskId: string): OrchestratorState | null {
    const row = this.db
      .prepare('SELECT * FROM orchestrator_state WHERE task_id = ?')
      .get(taskId) as OrchestratorRow | undefined;

    return row ? rowToState(row) : null;
  }

  update(
    taskId: string,
    fields: Partial<Pick<OrchestratorState, 'current' | 'previous' | 'lastAgent' | 'roundsReview'>>,
    expectedRev: number,
    now: string,
  ): OrchestratorState {
    const setClauses: string[] = ['updated_at = ?', 'rev = rev + 1'];
    const params: unknown[] = [now];

    if (fields.current !== undefined) {
      setClauses.push('current = ?');
      params.push(fields.current);
    }
    if (fields.previous !== undefined) {
      setClauses.push('previous = ?');
      params.push(fields.previous);
    }
    if (fields.lastAgent !== undefined) {
      setClauses.push('last_agent = ?');
      params.push(fields.lastAgent);
    }
    if (fields.roundsReview !== undefined) {
      setClauses.push('rounds_review = ?');
      params.push(fields.roundsReview);
    }

    params.push(taskId, expectedRev);

    const result = this.db
      .prepare(
        `UPDATE orchestrator_state SET ${setClauses.join(', ')} WHERE task_id = ? AND rev = ?`,
      )
      .run(...params);

    if (result.changes === 0) {
      const existing = this.getByTaskId(taskId);
      if (!existing) {
        throw new TaskNotFoundError(taskId);
      }
      throw new StaleRevisionError(taskId, expectedRev, existing.rev);
    }

    return this.getByTaskId(taskId)!;
  }
}
