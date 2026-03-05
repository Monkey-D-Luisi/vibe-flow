/**
 * Decision Timeout Cron
 *
 * Periodically scans the agent_decisions table for pending escalated decisions
 * that have exceeded their configured timeout. When a timeout is reached:
 *
 * - For `escalate` decisions (target is an agent): re-escalate to PM
 * - For `pause` decisions (human approval): auto-escalate to tech-lead
 *
 * Config values consumed from decisionConfig:
 * - timeoutMs (default 300_000 = 5 min): escalated-to-agent timeout
 * - humanApprovalTimeout (default 3_600_000 = 1 hour): human approval timeout
 */

import type Database from 'better-sqlite3';
import { MESSAGES_TABLE } from '../tools/shared-db.js';

/** Ensure the messages table exists (standalone version for cron context). */
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

interface DecisionTimeoutLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface DecisionTimeoutDeps {
  readonly db: Database.Database;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly logger: DecisionTimeoutLogger;
  readonly decisionConfig?: {
    timeoutMs?: number;
    humanApprovalTimeout?: number;
  };
}

const DEFAULT_AGENT_TIMEOUT_MS = 300_000;       // 5 minutes
const DEFAULT_HUMAN_TIMEOUT_MS = 3_600_000;     // 1 hour
const SWEEP_INTERVAL_MS = 60_000;               // 1 minute

interface PendingDecision {
  id: string;
  task_ref: string | null;
  category: string;
  question: string;
  approver: string;
  created_at: string;
}

/**
 * Check for timed-out decisions and escalate them.
 * Returns the number of decisions that were re-escalated.
 */
export function sweepDecisionTimeouts(deps: DecisionTimeoutDeps): number {
  const agentTimeoutMs = deps.decisionConfig?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const humanTimeoutMs = deps.decisionConfig?.humanApprovalTimeout ?? DEFAULT_HUMAN_TIMEOUT_MS;

  // Ensure messages table exists before we try to write
  ensureMessagesTableForCron(deps.db);

  const now = Date.now();

  // Find all escalated decisions that are still pending (decision IS NULL, escalated = 1)
  let rows: PendingDecision[];
  try {
    rows = deps.db.prepare(`
      SELECT id, task_ref, category, question, approver, created_at
      FROM agent_decisions
      WHERE escalated = 1 AND decision IS NULL AND approver IS NOT NULL
    `).all() as PendingDecision[];
  } catch {
    // Table may not exist yet
    return 0;
  }

  let escalatedCount = 0;

  for (const row of rows) {
    const createdAt = new Date(row.created_at).getTime();
    if (isNaN(createdAt)) continue;

    const isHuman = row.approver === 'human';
    const timeoutMs = isHuman ? humanTimeoutMs : agentTimeoutMs;
    const elapsed = now - createdAt;

    if (elapsed < timeoutMs) continue;

    // This decision has timed out — re-escalate
    const newApprover = isHuman ? 'tech-lead' : 'pm';
    const msgId = deps.generateId();
    const msgNow = deps.now();

    // Update the decision record to reflect the re-escalation
    deps.db.prepare(`
      UPDATE agent_decisions
      SET approver = ?, reasoning = reasoning || ' [TIMEOUT: re-escalated to ' || ? || ']'
      WHERE id = ?
    `).run(newApprover, newApprover, row.id);

    // Send escalation message
    const subject = `[Timeout Escalation] ${row.category} decision timed out`;
    const body = [
      `Decision ID: ${row.id}`,
      `Original approver: ${row.approver}`,
      `Category: ${row.category}`,
      `Question: ${row.question}`,
      row.task_ref ? `Task: ${row.task_ref}` : '',
      `Elapsed: ${Math.round(elapsed / 1000)}s (timeout: ${Math.round(timeoutMs / 1000)}s)`,
      '',
      'The original approver did not respond in time. Please review and decide.',
    ].filter(Boolean).join('\n');

    deps.db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, created_at)
      VALUES (?, ?, ?, ?, ?, 'urgent', ?, ?)
    `).run(msgId, 'decision-engine', newApprover, subject, body, row.task_ref ?? null, msgNow);

    deps.logger.info(
      `decision-timeout: Decision ${row.id} timed out (${Math.round(elapsed / 1000)}s). ` +
      `Re-escalated from ${row.approver} to ${newApprover}`,
    );
    escalatedCount++;
  }

  return escalatedCount;
}

export class DecisionTimeoutCron {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: DecisionTimeoutDeps) {}

  start(): void {
    this.timer = setInterval(() => {
      try {
        sweepDecisionTimeouts(this.deps);
      } catch (err: unknown) {
        this.deps.logger.warn(`decision-timeout-cron: sweep failed: ${String(err)}`);
      }
    }, SWEEP_INTERVAL_MS).unref();

    this.deps.logger.info('decision-timeout-cron: started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.deps.logger.info('decision-timeout-cron: stopped');
  }
}
