import type Database from 'better-sqlite3';
import type {
  BudgetRecord,
  BudgetScope,
  BudgetStatus,
} from '../domain/budget.js';
import { BudgetNotFoundError, StaleRevisionError } from '../domain/errors.js';

interface BudgetRow {
  id: string;
  scope: string;
  scope_id: string;
  limit_tokens: number;
  consumed_tokens: number;
  limit_usd: number;
  consumed_usd: number;
  status: string;
  warning_threshold: number;
  created_at: string;
  updated_at: string;
  rev: number;
}

function rowToBudget(row: BudgetRow): BudgetRecord {
  return {
    id: row.id,
    scope: row.scope as BudgetScope,
    scopeId: row.scope_id,
    limitTokens: row.limit_tokens,
    consumedTokens: row.consumed_tokens,
    limitUsd: row.limit_usd,
    consumedUsd: row.consumed_usd,
    status: row.status as BudgetStatus,
    warningThreshold: row.warning_threshold,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev,
  };
}

export class SqliteBudgetRepository {
  constructor(private readonly db: Database.Database) {}

  create(record: BudgetRecord): BudgetRecord {
    this.db
      .prepare(
        `INSERT INTO budget_records
         (id, scope, scope_id, limit_tokens, consumed_tokens, limit_usd, consumed_usd,
          status, warning_threshold, created_at, updated_at, rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.scope,
        record.scopeId,
        record.limitTokens,
        record.consumedTokens,
        record.limitUsd,
        record.consumedUsd,
        record.status,
        record.warningThreshold,
        record.createdAt,
        record.updatedAt,
        record.rev,
      );
    return record;
  }

  getById(id: string): BudgetRecord | null {
    const row = this.db
      .prepare('SELECT * FROM budget_records WHERE id = ?')
      .get(id) as BudgetRow | undefined;
    return row ? rowToBudget(row) : null;
  }

  getByScope(scope: BudgetScope, scopeId: string): BudgetRecord | null {
    const row = this.db
      .prepare('SELECT * FROM budget_records WHERE scope = ? AND scope_id = ?')
      .get(scope, scopeId) as BudgetRow | undefined;
    return row ? rowToBudget(row) : null;
  }

  listByScope(scope: BudgetScope): BudgetRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM budget_records WHERE scope = ? ORDER BY created_at ASC',
      )
      .all(scope) as BudgetRow[];
    return rows.map(rowToBudget);
  }

  listByStatus(status: BudgetStatus): BudgetRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM budget_records WHERE status = ? ORDER BY created_at ASC',
      )
      .all(status) as BudgetRow[];
    return rows.map(rowToBudget);
  }

  updateConsumption(
    id: string,
    consumedTokens: number,
    consumedUsd: number,
    status: BudgetStatus,
    expectedRev: number,
    now: string,
  ): BudgetRecord {
    const result = this.db
      .prepare(
        `UPDATE budget_records
         SET consumed_tokens = ?, consumed_usd = ?, status = ?,
             updated_at = ?, rev = rev + 1
         WHERE id = ? AND rev = ?`,
      )
      .run(consumedTokens, consumedUsd, status, now, id, expectedRev);

    if (result.changes === 0) {
      const existing = this.getById(id);
      if (!existing) throw new BudgetNotFoundError(id);
      throw new StaleRevisionError(id, expectedRev, existing.rev);
    }

    return this.getById(id)!;
  }

  replenish(
    id: string,
    additionalTokens: number,
    additionalUsd: number,
    expectedRev: number,
    now: string,
  ): BudgetRecord {
    const result = this.db
      .prepare(
        `UPDATE budget_records
         SET limit_tokens = limit_tokens + ?,
             limit_usd = limit_usd + ?,
             status = 'active',
             updated_at = ?,
             rev = rev + 1
         WHERE id = ? AND rev = ?`,
      )
      .run(additionalTokens, additionalUsd, now, id, expectedRev);

    if (result.changes === 0) {
      const existing = this.getById(id);
      if (!existing) throw new BudgetNotFoundError(id);
      throw new StaleRevisionError(id, expectedRev, existing.rev);
    }

    return this.getById(id)!;
  }

  resetConsumption(id: string, expectedRev: number, now: string): BudgetRecord {
    const result = this.db
      .prepare(
        `UPDATE budget_records
         SET consumed_tokens = 0, consumed_usd = 0, status = 'active',
             updated_at = ?, rev = rev + 1
         WHERE id = ? AND rev = ?`,
      )
      .run(now, id, expectedRev);

    if (result.changes === 0) {
      const existing = this.getById(id);
      if (!existing) throw new BudgetNotFoundError(id);
      throw new StaleRevisionError(id, expectedRev, existing.rev);
    }

    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM budget_records WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
