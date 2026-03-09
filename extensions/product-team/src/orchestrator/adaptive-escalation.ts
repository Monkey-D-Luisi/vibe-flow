import type Database from 'better-sqlite3';
import type { PatternReport } from '../schemas/decision-patterns.schema.js';

export interface AdaptivePolicy {
  readonly category: string;
  readonly agentId: string;
  readonly action: 'auto' | 'escalate' | 'pause' | 'retry';
  readonly target?: string;
  readonly confidence: number;
  readonly evidence: string;
  readonly pipelineRunAt: number;
  readonly humanOverride: boolean;
}

interface PolicyRow {
  id: string;
  category: string;
  agent_id: string;
  action: string;
  target: string | null;
  confidence: number;
  evidence: string;
  pipeline_run_at: number;
  human_override: number;
  created_at: string;
  updated_at: string;
}

interface PolicyChangeLog {
  readonly id: string;
  readonly category: string;
  readonly agentId: string;
  readonly previousAction: string | null;
  readonly newAction: string;
  readonly confidence: number;
  readonly evidence: string;
  readonly pipelineRun: number;
  readonly createdAt: string;
}

const ADAPTIVE_POLICIES_TABLE = 'adaptive_policies';
const POLICY_CHANGE_LOG_TABLE = 'policy_change_log';

/**
 * Adaptive Escalation Policy Engine.
 *
 * Reads pattern reports from DecisionPatternAnalyzer and applies
 * policy adjustments with safety constraints:
 * - Dampening: no change if policy changed in last N pipeline runs
 * - Max 1 change per category per analysis cycle
 * - Human overrides are never modified
 */
export class AdaptiveEscalationEngine {
  private readonly dampeningWindow: number;

  constructor(
    private readonly db: Database.Database,
    private readonly generateId: () => string,
    private readonly now: () => string,
    options?: { dampeningWindow?: number },
  ) {
    this.dampeningWindow = options?.dampeningWindow ?? 5;
    this.ensureTables();
  }

  /**
   * Apply pattern-based policy adjustments.
   * Returns the list of changes made.
   */
  applyPatternReport(report: PatternReport, currentPipelineRun: number): PolicyChangeLog[] {
    const changes: PolicyChangeLog[] = [];
    const changedCategories = new Set<string>();

    for (const rec of report.recommendations) {
      if (rec.action !== 'change_policy') continue;

      const category = typeof rec.details.category === 'string' ? rec.details.category : undefined;
      const agentId = typeof rec.details.agentId === 'string' ? rec.details.agentId : undefined;
      const newPolicy = typeof rec.details.newPolicy === 'string' ? rec.details.newPolicy : undefined;
      if (!category || !agentId || !newPolicy) continue;
      if (newPolicy !== 'auto' && newPolicy !== 'escalate') continue;

      const cacheKey = `${category}::${agentId}`;
      if (changedCategories.has(cacheKey)) continue;

      const existing = this.getPolicy(category, agentId);

      if (existing?.humanOverride) continue;

      if (existing && this.isDampened(existing, currentPipelineRun)) continue;

      if (existing?.action === newPolicy) continue;

      const change = this.upsertPolicy({
        category,
        agentId,
        action: newPolicy,
        target: newPolicy === 'escalate' ? 'tech-lead' : undefined,
        confidence: rec.confidence,
        evidence: JSON.stringify(rec.details),
        pipelineRunAt: currentPipelineRun,
      }, existing?.action ?? null);

      changes.push(change);
      changedCategories.add(cacheKey);
    }

    return changes;
  }

  /**
   * Get the adaptive policy for a (category, agentId) combo,
   * or null if no adaptive policy exists.
   */
  getPolicy(category: string, agentId: string): AdaptivePolicy | null {
    const row = this.db.prepare(`
      SELECT * FROM ${ADAPTIVE_POLICIES_TABLE}
      WHERE category = ? AND agent_id = ?
    `).get(category, agentId) as PolicyRow | undefined;

    if (!row) return null;

    return {
      category: row.category,
      agentId: row.agent_id,
      action: row.action as 'auto' | 'escalate' | 'pause' | 'retry',
      target: row.target ?? undefined,
      confidence: row.confidence,
      evidence: row.evidence,
      pipelineRunAt: row.pipeline_run_at,
      humanOverride: row.human_override === 1,
    };
  }

  /**
   * Get all adaptive policies.
   */
  getAllPolicies(): AdaptivePolicy[] {
    const rows = this.db.prepare(`
      SELECT * FROM ${ADAPTIVE_POLICIES_TABLE}
      ORDER BY category, agent_id
    `).all() as PolicyRow[];

    return rows.map((r) => ({
      category: r.category,
      agentId: r.agent_id,
      action: r.action as 'auto' | 'escalate' | 'pause' | 'retry',
      target: r.target ?? undefined,
      confidence: r.confidence,
      evidence: r.evidence,
      pipelineRunAt: r.pipeline_run_at,
      humanOverride: r.human_override === 1,
    }));
  }

  /**
   * Set a human override for a (category, agentId) combo.
   * This prevents adaptive changes to this policy.
   */
  setHumanOverride(category: string, agentId: string, action: string): void {
    const existing = this.getPolicy(category, agentId);
    const id = existing ? undefined : this.generateId();
    const now = this.now();

    if (existing) {
      this.db.prepare(`
        UPDATE ${ADAPTIVE_POLICIES_TABLE}
        SET action = ?, human_override = 1, updated_at = ?
        WHERE category = ? AND agent_id = ?
      `).run(action, now, category, agentId);
    } else {
      this.db.prepare(`
        INSERT INTO ${ADAPTIVE_POLICIES_TABLE}
          (id, category, agent_id, action, target, confidence, evidence, pipeline_run_at, human_override, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, 1.0, ?, 0, 1, ?, ?)
      `).run(id, category, agentId, action, 'Human override', now, now);
    }
  }

  /**
   * Get the change log for audit purposes.
   */
  getChangeLog(limit: number = 50): PolicyChangeLog[] {
    const rows = this.db.prepare(`
      SELECT * FROM ${POLICY_CHANGE_LOG_TABLE}
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      category: string;
      agent_id: string;
      previous_action: string | null;
      new_action: string;
      confidence: number;
      evidence: string;
      pipeline_run: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      agentId: r.agent_id,
      previousAction: r.previous_action,
      newAction: r.new_action,
      confidence: r.confidence,
      evidence: r.evidence,
      pipelineRun: r.pipeline_run,
      createdAt: r.created_at,
    }));
  }

  /**
   * Resolve the effective policy for a (category, agentId) combo,
   * merging adaptive policies over defaults.
   */
  resolvePolicy(
    category: string,
    agentId: string,
    defaultPolicies: Record<string, { action: string; target?: string }>,
  ): { action: string; target?: string; source: 'adaptive' | 'default' } {
    const adaptive = this.getPolicy(category, agentId);
    if (adaptive) {
      return {
        action: adaptive.action,
        target: adaptive.target,
        source: 'adaptive',
      };
    }

    const defaultPolicy = defaultPolicies[category];
    if (defaultPolicy) {
      return {
        action: defaultPolicy.action,
        target: defaultPolicy.target,
        source: 'default',
      };
    }

    return { action: 'auto', source: 'default' };
  }

  private isDampened(existing: AdaptivePolicy, currentPipelineRun: number): boolean {
    return (currentPipelineRun - existing.pipelineRunAt) < this.dampeningWindow;
  }

  private upsertPolicy(
    policy: {
      category: string;
      agentId: string;
      action: string;
      target?: string;
      confidence: number;
      evidence: string;
      pipelineRunAt: number;
    },
    previousAction: string | null,
  ): PolicyChangeLog {
    const now = this.now();
    const existing = this.getPolicy(policy.category, policy.agentId);

    if (existing) {
      this.db.prepare(`
        UPDATE ${ADAPTIVE_POLICIES_TABLE}
        SET action = ?, target = ?, confidence = ?, evidence = ?, pipeline_run_at = ?, updated_at = ?
        WHERE category = ? AND agent_id = ?
      `).run(
        policy.action, policy.target ?? null, policy.confidence,
        policy.evidence, policy.pipelineRunAt, now,
        policy.category, policy.agentId,
      );
    } else {
      const id = this.generateId();
      this.db.prepare(`
        INSERT INTO ${ADAPTIVE_POLICIES_TABLE}
          (id, category, agent_id, action, target, confidence, evidence, pipeline_run_at, human_override, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        id, policy.category, policy.agentId, policy.action,
        policy.target ?? null, policy.confidence, policy.evidence,
        policy.pipelineRunAt, now, now,
      );
    }

    const logId = this.generateId();
    this.db.prepare(`
      INSERT INTO ${POLICY_CHANGE_LOG_TABLE}
        (id, category, agent_id, previous_action, new_action, confidence, evidence, pipeline_run, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId, policy.category, policy.agentId, previousAction,
      policy.action, policy.confidence, policy.evidence,
      policy.pipelineRunAt, now,
    );

    return {
      id: logId,
      category: policy.category,
      agentId: policy.agentId,
      previousAction,
      newAction: policy.action,
      confidence: policy.confidence,
      evidence: policy.evidence,
      pipelineRun: policy.pipelineRunAt,
      createdAt: now,
    };
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${ADAPTIVE_POLICIES_TABLE} (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        pipeline_run_at INTEGER NOT NULL DEFAULT 0,
        human_override INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(category, agent_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${POLICY_CHANGE_LOG_TABLE} (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        previous_action TEXT,
        new_action TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        pipeline_run INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }
}
