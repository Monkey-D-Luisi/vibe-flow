import type { ToolDef, ToolDeps } from './index.js';
import { DecisionEvaluateParams, DecisionLogParams } from '../schemas/decision.schema.js';

interface DecisionPolicy {
  action: 'auto' | 'escalate' | 'pause' | 'retry';
  target?: string;
  notify?: boolean;
  maxRetries?: number;
}

const DEFAULT_POLICIES: Record<string, DecisionPolicy> = {
  technical: { action: 'auto', notify: false },
  scope: { action: 'escalate', target: 'tech-lead', notify: true },
  quality: { action: 'escalate', target: 'tech-lead', notify: true },
  conflict: { action: 'escalate', target: 'po', notify: true },
  budget: { action: 'pause', notify: true },
  blocker: { action: 'retry', maxRetries: 2, notify: true },
};

const DECISIONS_TABLE = 'agent_decisions';

function ensureDecisionsTable(deps: ToolDeps): void {
  deps.db.exec(`
    CREATE TABLE IF NOT EXISTS ${DECISIONS_TABLE} (
      id TEXT PRIMARY KEY,
      task_ref TEXT,
      agent_id TEXT NOT NULL,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      decision TEXT,
      reasoning TEXT,
      escalated INTEGER NOT NULL DEFAULT 0,
      approver TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function decisionEvaluateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'decision.evaluate',
    label: 'Evaluate Decision',
    description: 'Evaluate a decision using the configured escalation policy',
    parameters: DecisionEvaluateParams,
    execute: async (_toolCallId, params) => {
      ensureDecisionsTable(deps);
      const input = deps.validate<{
        category: string;
        question: string;
        options: Array<{ id: string; description: string; pros?: string; cons?: string }>;
        recommendation?: string;
        reasoning?: string;
        taskRef?: string;
      }>(DecisionEvaluateParams, params);

      const rawPolicies = deps.decisionConfig?.policies as unknown;
      let policy: DecisionPolicy = DEFAULT_POLICIES[input.category] ?? DEFAULT_POLICIES['technical'];
      if (rawPolicies && typeof rawPolicies === 'object') {
        const candidate = (rawPolicies as Record<string, unknown>)[input.category];
        if (candidate && typeof candidate === 'object') {
          const action = (candidate as { action?: unknown }).action;
          if (action === 'auto' || action === 'escalate' || action === 'pause' || action === 'retry') {
            policy = { ...(candidate as Record<string, unknown>), action } as DecisionPolicy;
          }
        }
      }

      // Circuit breaker: check decision count for this task
      if (input.taskRef) {
        const countRow = deps.db.prepare(
          `SELECT COUNT(*) as cnt FROM ${DECISIONS_TABLE} WHERE task_ref = ? AND agent_id = ?`,
        ).get(input.taskRef, 'calling-agent');
        const cnt =
          typeof countRow === 'object' && countRow !== null &&
          typeof (countRow as Record<string, unknown>)['cnt'] === 'number'
            ? (countRow as { cnt: number }).cnt
            : 0;
        if (cnt >= 5) {
          const cbId = deps.generateId();
          const cbNow = deps.now();
          deps.db.prepare(`
            INSERT INTO ${DECISIONS_TABLE} (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
          `).run(
            cbId,
            input.taskRef,
            'calling-agent',
            input.category,
            input.question,
            JSON.stringify(input.options),
            'Circuit breaker: max decisions per agent per task reached. Escalating.',
            'tech-lead',
            cbNow,
          );
          const result = {
            decisionId: cbId,
            decision: null,
            reasoning: 'Circuit breaker: max decisions per agent per task reached. Escalating.',
            escalated: true,
            approver: 'tech-lead',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        }
      }

      const id = deps.generateId();
      const now = deps.now();
      let decision: string | null = null;
      let escalated = false;
      let approver: string | undefined;

      if (policy.action === 'auto') {
        decision = input.recommendation ?? input.options[0].id;
      } else if (policy.action === 'escalate') {
        escalated = true;
        approver = policy.target ?? 'tech-lead';
      } else if (policy.action === 'pause') {
        escalated = true;
        approver = 'human';
      } else if (policy.action === 'retry') {
        decision = input.recommendation ?? input.options[0].id;
      }

      deps.db.prepare(`
        INSERT INTO ${DECISIONS_TABLE} (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.taskRef ?? null,
        'calling-agent',
        input.category,
        input.question,
        JSON.stringify(input.options),
        decision,
        input.reasoning ?? null,
        escalated ? 1 : 0,
        approver ?? null,
        now,
      );

      deps.logger?.info(`decision.evaluate: ${id} [${input.category}] escalated=${escalated} decision=${decision ?? 'pending'}`);

      const result = {
        decisionId: id,
        decision,
        reasoning: input.reasoning ?? (escalated ? `Escalated to ${approver} per ${input.category} policy` : 'Auto-decided'),
        escalated,
        approver: approver ?? null,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function decisionLogToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'decision.log',
    label: 'Decision Log',
    description: 'Retrieve the audit trail of all decisions made for a task',
    parameters: DecisionLogParams,
    execute: async (_toolCallId, params) => {
      ensureDecisionsTable(deps);
      const input = deps.validate<{ taskRef: string }>(DecisionLogParams, params);

      const rows = deps.db.prepare(`
        SELECT id, task_ref, agent_id, category, question, decision, reasoning, escalated, approver, created_at
        FROM ${DECISIONS_TABLE}
        WHERE task_ref = ?
        ORDER BY created_at ASC
      `).all(input.taskRef) as Array<{
        id: string;
        task_ref: string;
        agent_id: string;
        category: string;
        question: string;
        decision: string | null;
        reasoning: string | null;
        escalated: number;
        approver: string | null;
        created_at: string;
      }>;

      const decisions = rows.map((r) => ({
        id: r.id,
        category: r.category,
        question: r.question,
        decision: r.decision,
        reasoning: r.reasoning,
        decidedBy: r.escalated ? r.approver : r.agent_id,
        escalated: r.escalated === 1,
        timestamp: r.created_at,
      }));

      const result = { decisions, count: decisions.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
