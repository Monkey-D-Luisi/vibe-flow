import type { ToolDef, ToolDeps } from './index.js';
import { DecisionEvaluateParams, DecisionLogParams } from '../schemas/decision.schema.js';
import { MESSAGES_TABLE, ensureMessagesTable } from './shared-db.js';
import { Type } from '@sinclair/typebox';

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
  // EP09 Task 0071: outcome tracking column
  try { deps.db.exec(`ALTER TABLE ${DECISIONS_TABLE} ADD COLUMN outcome TEXT`); } catch { /* already exists */ }
}

/** Send an inter-agent message for escalation (writes to the shared messages table). */
function sendEscalationMessage(
  deps: ToolDeps,
  opts: { fromAgent: string; toAgent: string; decisionId: string; category: string; question: string; options: string; taskRef?: string },
): string {
  ensureMessagesTable(deps);
  const msgId = deps.generateId();
  const now = deps.now();
  const subject = `[Escalation] ${opts.category} decision requires your input`;
  const body = [
    `Decision ID: ${opts.decisionId}`,
    `Category: ${opts.category}`,
    `Question: ${opts.question}`,
    `Options: ${opts.options}`,
    opts.taskRef ? `Task: ${opts.taskRef}` : '',
    '',
    'Please review this decision. Use team_reply to respond with your choice, or use decision_evaluate to log the final decision.',
  ].filter(Boolean).join('\n');

  deps.db.prepare(`
    INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, created_at)
    VALUES (?, ?, ?, ?, ?, 'urgent', ?, ?)
  `).run(msgId, opts.fromAgent, opts.toAgent, subject, body, opts.taskRef ?? null, now);

  deps.logger?.info(`decision-engine: Escalation message ${msgId} sent to ${opts.toAgent}`);
  return msgId;
}

export function decisionEvaluateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'decision.evaluate',
    label: 'Evaluate Decision',
    description: 'Evaluate a decision using the configured escalation policy',
    parameters: DecisionEvaluateParams,
    execute: async (_toolCallId, params) => {
      ensureDecisionsTable(deps);
      const escalationTarget = deps.orchestratorConfig?.escalationTarget ?? 'tech-lead';
      const input = deps.validate<{
        category: string;
        question: string;
        options: Array<{ id: string; description: string; pros?: string; cons?: string }>;
        recommendation?: string;
        reasoning?: string;
        taskRef?: string;
        agentId?: string;
      }>(DecisionEvaluateParams, params);

      // Resolve caller identity: prefer hook-injected agentId, fall back to legacy placeholder
      const agentId = input.agentId ?? 'calling-agent';

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
        ).get(input.taskRef, agentId);
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
            agentId,
            input.category,
            input.question,
            JSON.stringify(input.options),
            'Circuit breaker: max decisions per agent per task reached. Escalating.',
            escalationTarget,
            cbNow,
          );

          const cbMsgId = sendEscalationMessage(deps, {
            fromAgent: 'decision-engine',
            toAgent: escalationTarget,
            decisionId: cbId,
            category: input.category,
            question: input.question,
            options: JSON.stringify(input.options, null, 2),
            taskRef: input.taskRef,
          });

          const result: Record<string, unknown> = {
            decisionId: cbId,
            decision: null,
            reasoning: 'Circuit breaker: max decisions per agent per task reached. Escalating.',
            escalated: true,
            approver: escalationTarget,
            escalationMessageId: cbMsgId,
            nextAction: {
              action: 'spawn_subagent',
              agentId: escalationTarget,
              task: `You have a pending escalated decision in your inbox (message ID: ${cbMsgId}). ` +
                `Read it with team_inbox, then make a decision on: "${input.question}". ` +
                `Reply using team_reply with your choice.`,
              reason: 'Circuit breaker triggered: too many decisions on this task.',
            },
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
        approver = policy.target ?? escalationTarget;
      } else if (policy.action === 'pause') {
        escalated = true;
        approver = 'human';
      } else if (policy.action === 'retry') {
        // Enforce maxRetries: count previous blocker-category retries for this task+agent
        const maxRetries = policy.maxRetries ?? 2;
        if (input.taskRef) {
          const retryCountRow = deps.db.prepare(
            `SELECT COUNT(*) as cnt FROM ${DECISIONS_TABLE} WHERE task_ref = ? AND agent_id = ? AND category = ?`,
          ).get(input.taskRef, agentId, input.category);
          const retryCount =
            typeof retryCountRow === 'object' && retryCountRow !== null &&
            typeof (retryCountRow as Record<string, unknown>)['cnt'] === 'number'
              ? (retryCountRow as { cnt: number }).cnt
              : 0;
          if (retryCount >= maxRetries) {
            // maxRetries exceeded — force escalation
            escalated = true;
            approver = escalationTarget;
            decision = null;
          } else {
            decision = input.recommendation ?? input.options[0].id;
          }
        } else {
          decision = input.recommendation ?? input.options[0].id;
        }
      }

      deps.db.prepare(`
        INSERT INTO ${DECISIONS_TABLE} (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.taskRef ?? null,
        agentId,
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

      // Auto-send escalation message to the target agent
      let escalationMessageId: string | null = null;
      if (escalated && approver && approver !== 'human') {
        escalationMessageId = sendEscalationMessage(deps, {
          fromAgent: 'decision-engine',
          toAgent: approver,
          decisionId: id,
          category: input.category,
          question: input.question,
          options: JSON.stringify(input.options, null, 2),
          taskRef: input.taskRef,
        });
      }

      const result: Record<string, unknown> = {
        decisionId: id,
        decision,
        reasoning: input.reasoning ?? (escalated ? `Escalated to ${approver} per ${input.category} policy` : 'Auto-decided'),
        escalated,
        approver: approver ?? null,
      };

      // Include actionable next-step for the calling agent
      if (escalated && approver && approver !== 'human') {
        result['escalationMessageId'] = escalationMessageId;
        result['nextAction'] = {
          action: 'spawn_subagent',
          agentId: approver,
          task: `You have a pending escalated decision in your inbox (message ID: ${escalationMessageId}). ` +
            `Read it with team_inbox, then make a decision on: "${input.question}". ` +
            `Reply using team_reply with your choice.`,
          reason: `The ${input.category} policy requires ${approver} to review this decision.`,
        };
      }

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

const DecisionOutcomeParams = Type.Object({
  taskRef: Type.String({ minLength: 1, description: 'Task ID to tag decision outcomes for' }),
  outcome: Type.Union([
    Type.Literal('success'),
    Type.Literal('overridden'),
    Type.Literal('failed'),
  ], { description: 'Outcome to apply to all untagged decisions for this task' }),
});

/**
 * Tag all decisions for a task with an outcome (Task 0071).
 * Called when a task reaches done/failed to enable decision quality analysis.
 */
export function decisionOutcomeToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'decision.outcome',
    label: 'Tag Decision Outcomes',
    description: 'Tag decisions for a completed task with success/overridden/failed outcome',
    parameters: DecisionOutcomeParams,
    execute: async (_toolCallId, params) => {
      ensureDecisionsTable(deps);
      const input = deps.validate<{ taskRef: string; outcome: string }>(DecisionOutcomeParams, params);

      const updated = deps.db.prepare(`
        UPDATE ${DECISIONS_TABLE}
        SET outcome = ?
        WHERE task_ref = ? AND outcome IS NULL
      `).run(input.outcome, input.taskRef);

      const count = updated.changes;
      deps.logger?.info(`decision.outcome: Tagged ${count} decisions for ${input.taskRef} as ${input.outcome}`);

      const result = { taskRef: input.taskRef, outcome: input.outcome, taggedCount: count };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}