/**
 * Pipeline Stage Timeout Cron (Task 0063)
 *
 * Periodically checks all in-flight pipeline tasks for stage timeout violations.
 * When a stage has exceeded its configured timeout:
 * 1. First violation: sends an urgent message to the stage owner
 * 2. Second check (still timed out): escalates to tech-lead
 *
 * Config consumed: orchestratorConfig.stageTimeouts (e.g. { IMPLEMENTATION: 1800000 })
 */

import type Database from 'better-sqlite3';
import { MESSAGES_TABLE } from '../tools/shared-db.js';

interface StageTimeoutLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface StageTimeoutDeps {
  readonly db: Database.Database;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly logger: StageTimeoutLogger;
  readonly orchestratorConfig?: {
    stageTimeouts?: Record<string, number>;
    autoEscalateAfterRetries?: boolean;
  };
}

const SWEEP_INTERVAL_MS = 60_000; // 1 minute

interface PipelineTask {
  id: string;
  metadata: string;
  pipeline_stage: string | null;
}

/** Ensure the messages table exists. */
function ensureMessagesTableForCron(db: Database.Database): void {
  db.exec(`
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
}

/**
 * Check all pipeline tasks for stage timeout violations.
 * Returns number of timeouts detected and escalated.
 */
export function sweepStageTimeouts(deps: StageTimeoutDeps): number {
  const timeouts = deps.orchestratorConfig?.stageTimeouts ?? {};
  if (Object.keys(timeouts).length === 0) return 0;

  ensureMessagesTableForCron(deps.db);
  const now = Date.now();
  let escalatedCount = 0;

  // Find all pipeline tasks (those with tags containing 'pipeline')
  let rows: PipelineTask[];
  try {
    rows = deps.db.prepare(`
      SELECT id, metadata, pipeline_stage FROM task_records
      WHERE tags LIKE '%pipeline%' AND status NOT IN ('done', 'cancelled')
    `).all() as PipelineTask[];
  } catch {
    return 0;
  }

  for (const row of rows) {
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(row.metadata);
    } catch {
      continue;
    }

    const stage = row.pipeline_stage ?? String(meta.pipelineStage ?? '');
    if (!stage || stage === 'DONE') continue;

    const timeoutMs = timeouts[stage];
    if (!timeoutMs) continue;

    const stageStartKey = `${stage}_startedAt`;
    const startedAt = typeof meta[stageStartKey] === 'string'
      ? new Date(meta[stageStartKey] as string).getTime()
      : (typeof meta.pipelineStartedAt === 'string' ? new Date(meta.pipelineStartedAt as string).getTime() : 0);

    if (!startedAt || isNaN(startedAt)) continue;

    const elapsed = now - startedAt;
    if (elapsed < timeoutMs) continue;

    // Stage has timed out
    const alreadyEscalated = meta[`${stage}_timeoutEscalated`] === true;
    const owner = String(meta.pipelineOwner ?? 'system');
    const target = alreadyEscalated ? 'tech-lead' : owner;

    const msgId = deps.generateId();
    const msgNow = deps.now();
    const subject = `[Stage Timeout] ${stage} exceeded ${Math.round(timeoutMs / 1000)}s`;
    const body = [
      `Task: ${row.id}`,
      `Stage: ${stage}`,
      `Owner: ${owner}`,
      `Elapsed: ${Math.round(elapsed / 1000)}s (timeout: ${Math.round(timeoutMs / 1000)}s)`,
      alreadyEscalated ? 'This is a second timeout escalation.' : '',
      '',
      alreadyEscalated
        ? 'The stage owner did not complete in time after the first warning. Please intervene.'
        : 'Please complete this stage or call pipeline_advance to move forward.',
    ].filter(Boolean).join('\n');

    deps.db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, created_at)
      VALUES (?, ?, ?, ?, ?, 'urgent', ?, ?)
    `).run(msgId, 'pipeline-cron', target, subject, body, row.id, msgNow);

    // Mark as escalated in metadata so next sweep does second-level escalation
    if (!alreadyEscalated) {
      try {
        const updated = { ...meta, [`${stage}_timeoutEscalated`]: true };
        deps.db.prepare('UPDATE task_records SET metadata = ? WHERE id = ?')
          .run(JSON.stringify(updated), row.id);
      } catch {
        // best effort
      }
    }

    deps.logger.info(
      `stage-timeout: Task ${row.id} stage ${stage} timed out ` +
      `(${Math.round(elapsed / 1000)}s > ${Math.round(timeoutMs / 1000)}s). ` +
      `Escalated to ${target}`,
    );
    escalatedCount++;
  }

  return escalatedCount;
}

export class StageTimeoutCron {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: StageTimeoutDeps) {}

  start(): void {
    this.timer = setInterval(() => {
      try {
        sweepStageTimeouts(this.deps);
      } catch (err: unknown) {
        this.deps.logger.warn(`stage-timeout-cron: sweep failed: ${String(err)}`);
      }
    }, SWEEP_INTERVAL_MS).unref();

    this.deps.logger.info('stage-timeout-cron: started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.deps.logger.info('stage-timeout-cron: stopped');
  }
}
