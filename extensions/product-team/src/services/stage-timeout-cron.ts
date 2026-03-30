/**
 * Pipeline Stage Timeout Cron (Task 0063)
 *
 * Periodically checks all in-flight pipeline tasks for stage timeout violations.
 * When a stage has exceeded its configured timeout:
 * 1. First violation: sends an urgent message to the stage owner AND spawns them
 * 2. Second check (still timed out): escalates to tech-lead AND spawns them
 * 3. After maxTimeoutEscalations: marks task as stalled, stops firing
 *
 * Config consumed: orchestratorConfig.stageTimeouts (e.g. { IMPLEMENTATION: 1800000 })
 */

import type Database from 'better-sqlite3';
import { MESSAGES_TABLE } from '../tools/shared-db.js';
import type { AgentSpawnSink } from '../hooks/auto-spawn.js';

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
    maxTimeoutEscalations?: number;
    escalationTarget?: string;
  };
  readonly agentSpawner?: AgentSpawnSink;
  readonly sessionCleaner?: {
    clearAgentSessions(agentId: string): void;
  };
}

const SWEEP_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_MAX_ESCALATIONS = 3;

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
  const maxEscalations = deps.orchestratorConfig?.maxTimeoutEscalations ?? DEFAULT_MAX_ESCALATIONS;
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

    // Check if task is already stalled — stop firing for it
    if (meta[`${stage}_stalled`] === true) continue;

    // Check escalation count against max
    const escalationCountKey = `${stage}_timeoutEscalationCount`;
    const escalationCount = typeof meta[escalationCountKey] === 'number'
      ? meta[escalationCountKey] as number
      : 0;

    if (escalationCount >= maxEscalations) {
      // Mark as stalled and stop
      try {
        const updated = { ...meta, [`${stage}_stalled`]: true };
        deps.db.prepare('UPDATE task_records SET metadata = ? WHERE id = ?')
          .run(JSON.stringify(updated), row.id);
      } catch {
        // best effort
      }
      deps.logger.warn(
        `stage-timeout: Task ${row.id} marked as stalled at ${stage} after ${escalationCount} escalations`,
      );
      continue;
    }

    // Stage has timed out
    const alreadyEscalated = meta[`${stage}_timeoutEscalated`] === true;
    const owner = String(meta.pipelineOwner ?? 'system');
    const escalationTarget = deps.orchestratorConfig?.escalationTarget ?? 'tech-lead';
    const target = alreadyEscalated ? escalationTarget : owner;

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

    // Update metadata: mark escalated + increment count
    try {
      const updated = {
        ...meta,
        [`${stage}_timeoutEscalated`]: true,
        [escalationCountKey]: escalationCount + 1,
      };
      deps.db.prepare('UPDATE task_records SET metadata = ? WHERE id = ?')
        .run(JSON.stringify(updated), row.id);
    } catch {
      // best effort
    }

    // Spawn the target agent so it actually runs to handle the timeout
    if (deps.agentSpawner) {
      // Defense-in-depth: clear corrupted sessions before retry so the agent
      // gets a fresh session. Without this, a corrupt .jsonl causes every retry
      // to crash with "No tool call found" until the stall guard kicks in.
      if (escalationCount > 0 && deps.sessionCleaner) {
        try {
          deps.sessionCleaner.clearAgentSessions(target);
          deps.logger.info(`stage-timeout: cleared sessions for "${target}" before retry`);
        } catch (err: unknown) {
          deps.logger.warn(`stage-timeout: session clear failed for "${target}": ${String(err)}`);
        }
      }
      const spawnMessage = alreadyEscalated
        ? `[Stage Timeout Recovery] Task ${row.id} has been stuck at ${stage} beyond the timeout. ` +
          `The stage owner (${owner}) did not complete in time. Please investigate using ` +
          `pipeline_status and task_get({ id: "${row.id}" }), then either complete the work and call ` +
          `pipeline_advance({ taskId: "${row.id}" }), or use pipeline_skip/pipeline_retry.`
        : `[Stage Timeout] Your pipeline stage ${stage} for task ${row.id} has timed out ` +
          `(${Math.round(elapsed / 1000)}s elapsed). Please complete the stage work and call ` +
          `pipeline_advance({ taskId: "${row.id}" }) to move forward. If blocked, use ` +
          `decision_evaluate to escalate.`;

      try {
        deps.agentSpawner.spawnAgent(target, spawnMessage);
        deps.logger.info(`stage-timeout: spawned agent "${target}" for task ${row.id}`);
      } catch (err: unknown) {
        deps.logger.warn(`stage-timeout: failed to spawn "${target}": ${String(err)}`);
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
