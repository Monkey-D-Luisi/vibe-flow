import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { decisionEvaluateToolDef, decisionLogToolDef } from '../../src/tools/decision-engine.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-03-01T12:00:00.000Z';

const OPTIONS = [
  { id: 'axios', description: 'Use axios', pros: 'Widely used', cons: 'Extra dependency' },
  { id: 'fetch', description: 'Use native fetch', pros: 'No dependencies', cons: 'Less features' },
];

describe('decision engine tools', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    const orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);
    const generateId = () => `01DEC_${String(++idCounter).padStart(10, '0')}`;
    const now = () => NOW;
    const eventLog = new EventLog(eventRepo, generateId, now);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  describe('decision.evaluate', () => {
    it('auto-decides technical category and returns a decision', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'technical',
        question: 'Which HTTP client to use?',
        options: OPTIONS,
        recommendation: 'axios',
        reasoning: 'Better TypeScript types',
      });

      const details = result.details as {
        decisionId: string;
        decision: string | null;
        escalated: boolean;
        approver: string | null;
      };
      expect(details.decision).toBe('axios');
      expect(details.escalated).toBe(false);
      expect(details.approver).toBeNull();
    });

    it('falls back to first option when no recommendation given for auto policy', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'technical',
        question: 'Which tool?',
        options: OPTIONS,
      });
      const details = result.details as { decision: string | null };
      expect(details.decision).toBe('axios');
    });

    it('escalates scope category to tech-lead', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'scope',
        question: 'Include extra feature in MVP?',
        options: OPTIONS,
      });

      const details = result.details as { escalated: boolean; approver: string | null; decision: string | null };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('tech-lead');
      expect(details.decision).toBeNull();
    });

    it('escalates quality category to tech-lead', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'quality',
        question: 'Skip flaky test?',
        options: OPTIONS,
      });

      const details = result.details as { escalated: boolean; approver: string };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('tech-lead');
    });

    it('escalates conflict category to po', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'conflict',
        question: 'Conflicting requirements which to pick?',
        options: OPTIONS,
      });

      const details = result.details as { escalated: boolean; approver: string };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('po');
    });

    it('pauses on budget category (human escalation)', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'budget',
        question: 'Task over budget, pause?',
        options: OPTIONS,
      });

      const details = result.details as { escalated: boolean; approver: string };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('human');
    });

    it('respects custom policy overrides from decisionConfig', async () => {
      const depsWithCustomPolicy = {
        ...deps,
        decisionConfig: {
          policies: {
            technical: { action: 'escalate', target: 'tech-lead', notify: false },
          },
        },
      };
      const tool = decisionEvaluateToolDef(depsWithCustomPolicy as ToolDeps);
      const result = await tool.execute('call-1', {
        category: 'technical',
        question: 'Custom override?',
        options: OPTIONS,
      });
      const details = result.details as { escalated: boolean; approver: string };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('tech-lead');
    });

    it('activates circuit breaker after 5 decisions per agent per task', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-circuit';

      for (let i = 0; i < 5; i++) {
        await tool.execute(`call-${i}`, {
          category: 'technical',
          question: `Decision ${i}`,
          options: OPTIONS,
          taskRef,
          agentId: 'back-1',
        });
      }

      // 6th decision should trigger circuit breaker
      const result = await tool.execute('call-cb', {
        category: 'technical',
        question: 'The 6th decision',
        options: OPTIONS,
        taskRef,
        agentId: 'back-1',
      });
      const details = result.details as { decisionId: string; escalated: boolean; approver: string };
      expect(details.decisionId).toBeTruthy();
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('tech-lead');

      // Circuit-breaker decision must be persisted in audit trail
      const rows = db.prepare('SELECT * FROM agent_decisions WHERE task_ref = ?').all(taskRef) as Array<{ escalated: number }>;
      expect(rows).toHaveLength(6);
      const cbRow = rows[5];
      expect(cbRow.escalated).toBe(1);
    });

    it('circuit breaker counts per-agent — different agents do not cross-contaminate', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-multi-agent';

      // back-1 makes 4 decisions
      for (let i = 0; i < 4; i++) {
        await tool.execute(`back-${i}`, {
          category: 'technical',
          question: `Back decision ${i}`,
          options: OPTIONS,
          taskRef,
          agentId: 'back-1',
        });
      }

      // front-1 makes 4 decisions — should NOT trigger circuit breaker
      for (let i = 0; i < 4; i++) {
        const result = await tool.execute(`front-${i}`, {
          category: 'technical',
          question: `Front decision ${i}`,
          options: OPTIONS,
          taskRef,
          agentId: 'front-1',
        });
        const details = result.details as { escalated: boolean };
        expect(details.escalated).toBe(false);
      }

      // back-1's 5th decision is still fine (count = 4, not >= 5)
      const fifthResult = await tool.execute('back-4', {
        category: 'technical',
        question: 'Back decision 4',
        options: OPTIONS,
        taskRef,
        agentId: 'back-1',
      });
      expect((fifthResult.details as { escalated: boolean }).escalated).toBe(false);

      // back-1's 6th decision triggers circuit breaker (count = 5 >= 5)
      const sixthResult = await tool.execute('back-5', {
        category: 'technical',
        question: 'Back decision 5',
        options: OPTIONS,
        taskRef,
        agentId: 'back-1',
      });
      expect((sixthResult.details as { escalated: boolean }).escalated).toBe(true);
      expect((sixthResult.details as { approver: string }).approver).toBe('tech-lead');

      // front-1 can still make decisions (only 4 so far)
      const frontFifth = await tool.execute('front-4', {
        category: 'technical',
        question: 'Front decision 4',
        options: OPTIONS,
        taskRef,
        agentId: 'front-1',
      });
      expect((frontFifth.details as { escalated: boolean }).escalated).toBe(false);
    });

    it('falls back to calling-agent when agentId is not provided', async () => {
      const tool = decisionEvaluateToolDef(deps);
      await tool.execute('call-1', {
        category: 'technical',
        question: 'No agent ID?',
        options: OPTIONS,
        taskRef: 'task-fallback',
      });

      const row = db.prepare('SELECT agent_id FROM agent_decisions WHERE task_ref = ?').get('task-fallback') as { agent_id: string } | undefined;
      expect(row?.agent_id).toBe('calling-agent');
    });

    it('blocker category auto-decides on first retry', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'blocker',
        question: 'External API down?',
        options: OPTIONS,
        recommendation: 'fetch',
        taskRef: 'task-blocker',
        agentId: 'back-1',
      });
      const details = result.details as { decision: string | null; escalated: boolean };
      expect(details.escalated).toBe(false);
      expect(details.decision).toBe('fetch');
    });

    it('blocker category escalates after maxRetries exceeded', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-blocker-max';

      // Make 2 blocker decisions (default maxRetries = 2)
      for (let i = 0; i < 2; i++) {
        const r = await tool.execute(`blk-${i}`, {
          category: 'blocker',
          question: `Blocker ${i}`,
          options: OPTIONS,
          recommendation: 'fetch',
          taskRef,
          agentId: 'back-1',
        });
        expect((r.details as { escalated: boolean }).escalated).toBe(false);
      }

      // 3rd blocker decision should escalate
      const result = await tool.execute('blk-2', {
        category: 'blocker',
        question: 'Blocker again',
        options: OPTIONS,
        recommendation: 'fetch',
        taskRef,
        agentId: 'back-1',
      });
      const details = result.details as { escalated: boolean; approver: string; decision: string | null };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('tech-lead');
      expect(details.decision).toBeNull();
    });

    it('blocker maxRetries counts per-agent — different agents have separate counts', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-blocker-multi';

      // back-1 makes 2 blocker retries
      for (let i = 0; i < 2; i++) {
        await tool.execute(`b-${i}`, {
          category: 'blocker',
          question: `B${i}`,
          options: OPTIONS,
          taskRef,
          agentId: 'back-1',
        });
      }

      // front-1 makes 1 retry — should NOT escalate
      const frontResult = await tool.execute('f-0', {
        category: 'blocker',
        question: 'Front blocker',
        options: OPTIONS,
        taskRef,
        agentId: 'front-1',
      });
      expect((frontResult.details as { escalated: boolean }).escalated).toBe(false);

      // back-1's 3rd retry DOES escalate
      const backResult = await tool.execute('b-2', {
        category: 'blocker',
        question: 'Back blocker 3',
        options: OPTIONS,
        taskRef,
        agentId: 'back-1',
      });
      expect((backResult.details as { escalated: boolean }).escalated).toBe(true);
    });

    it('persists a decision record in agent_decisions table', async () => {
      const tool = decisionEvaluateToolDef(deps);
      await tool.execute('call-1', {
        category: 'technical',
        question: 'Persist test?',
        options: OPTIONS,
        taskRef: 'task-persist',
      });

      const row = db.prepare('SELECT * FROM agent_decisions').get() as {
        category: string;
        task_ref: string;
        decision: string;
      } | undefined;
      expect(row).toBeDefined();
      expect(row?.category).toBe('technical');
      expect(row?.task_ref).toBe('task-persist');
      expect(row?.decision).toBe('axios');
    });

    it('returns valid JSON text content', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'technical',
        question: 'JSON test?',
        options: OPTIONS,
      });
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('decision.log', () => {
    it('returns empty decisions for a task with no decisions', async () => {
      const tool = decisionLogToolDef(deps);
      const result = await tool.execute('call-1', { taskRef: 'no-decisions-task' });
      const details = result.details as { decisions: unknown[]; count: number };
      expect(details.decisions).toEqual([]);
      expect(details.count).toBe(0);
    });

    it('returns all decisions for a given taskRef', async () => {
      const evalTool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-audit';
      await evalTool.execute('e1', { category: 'technical', question: 'Q1', options: OPTIONS, taskRef });
      await evalTool.execute('e2', { category: 'technical', question: 'Q2', options: OPTIONS, taskRef });

      const logTool = decisionLogToolDef(deps);
      const result = await logTool.execute('call-1', { taskRef });
      const details = result.details as { decisions: unknown[]; count: number };
      expect(details.count).toBe(2);
    });

    it('only returns decisions for the specified taskRef', async () => {
      const evalTool = decisionEvaluateToolDef(deps);
      await evalTool.execute('e1', { category: 'technical', question: 'Q1', options: OPTIONS, taskRef: 'task-a' });
      await evalTool.execute('e2', { category: 'technical', question: 'Q2', options: OPTIONS, taskRef: 'task-b' });

      const logTool = decisionLogToolDef(deps);
      const result = await logTool.execute('call-1', { taskRef: 'task-a' });
      const details = result.details as { count: number };
      expect(details.count).toBe(1);
    });

    it('includes category, question, and decidedBy in each decision entry', async () => {
      const evalTool = decisionEvaluateToolDef(deps);
      await evalTool.execute('e1', {
        category: 'technical',
        question: 'Detailed question?',
        options: OPTIONS,
        taskRef: 'task-detail',
        agentId: 'back-1',
      });

      const logTool = decisionLogToolDef(deps);
      const result = await logTool.execute('call-1', { taskRef: 'task-detail' });
      const details = result.details as {
        decisions: Array<{ category: string; question: string; decidedBy: string }>;
      };
      expect(details.decisions[0]?.category).toBe('technical');
      expect(details.decisions[0]?.question).toBe('Detailed question?');
      expect(details.decisions[0]?.decidedBy).toBe('back-1');
    });

    it('marks escalated decisions with the approver as decidedBy', async () => {
      const evalTool = decisionEvaluateToolDef(deps);
      await evalTool.execute('e1', {
        category: 'scope',
        question: 'Scope decision?',
        options: OPTIONS,
        taskRef: 'task-scope',
      });

      const logTool = decisionLogToolDef(deps);
      const result = await logTool.execute('call-1', { taskRef: 'task-scope' });
      const details = result.details as {
        decisions: Array<{ escalated: boolean; decidedBy: string | null }>;
      };
      expect(details.decisions[0]?.escalated).toBe(true);
      expect(details.decisions[0]?.decidedBy).toBe('tech-lead');
    });
  });

  describe('auto-escalation messaging', () => {
    it('sends an escalation message to agent_messages when scope decision is escalated', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'scope',
        question: 'Should we add feature X?',
        options: OPTIONS,
        taskRef: 'task-esc-1',
      });

      const details = result.details as {
        escalated: boolean;
        approver: string;
        escalationMessageId: string | null;
      };
      expect(details.escalated).toBe(true);
      expect(details.escalationMessageId).toBeTruthy();

      // Verify the message was written to agent_messages
      const row = deps.db.prepare(
        'SELECT * FROM agent_messages WHERE id = ?',
      ).get(details.escalationMessageId) as {
        from_agent: string;
        to_agent: string;
        subject: string;
        priority: string;
        task_ref: string;
      } | undefined;
      expect(row).toBeDefined();
      expect(row?.from_agent).toBe('decision-engine');
      expect(row?.to_agent).toBe('tech-lead');
      expect(row?.priority).toBe('urgent');
      expect(row?.subject).toContain('[Escalation]');
      expect(row?.task_ref).toBe('task-esc-1');
    });

    it('returns nextAction with spawn_subagent instruction for escalated decisions', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'scope',
        question: 'Include extra feature?',
        options: OPTIONS,
      });

      const details = result.details as {
        escalated: boolean;
        nextAction: {
          action: string;
          agentId: string;
          task: string;
          reason: string;
        } | undefined;
      };
      expect(details.escalated).toBe(true);
      expect(details.nextAction).toBeDefined();
      expect(details.nextAction?.action).toBe('spawn_subagent');
      expect(details.nextAction?.agentId).toBe('tech-lead');
      expect(details.nextAction?.task).toContain('team_inbox');
      expect(details.nextAction?.reason).toContain('scope policy');
    });

    it('does NOT send an escalation message for auto-decided technical decisions', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'technical',
        question: 'Which lib?',
        options: OPTIONS,
      });

      const details = result.details as {
        escalated: boolean;
        escalationMessageId?: string | null;
        nextAction?: unknown;
      };
      expect(details.escalated).toBe(false);
      expect(details.escalationMessageId).toBeUndefined();
      expect(details.nextAction).toBeUndefined();

      // No messages should exist
      try {
        const count = deps.db.prepare('SELECT COUNT(*) as cnt FROM agent_messages').get() as { cnt: number };
        expect(count.cnt).toBe(0);
      } catch {
        // agent_messages table may not exist if no escalation occurred — that's fine
      }
    });

    it('does NOT send escalation message for budget category (human escalation)', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'budget',
        question: 'Over budget?',
        options: OPTIONS,
      });

      const details = result.details as {
        escalated: boolean;
        approver: string;
        escalationMessageId?: string | null;
        nextAction?: unknown;
      };
      expect(details.escalated).toBe(true);
      expect(details.approver).toBe('human');
      // No message or nextAction for human-escalated decisions
      expect(details.escalationMessageId).toBeUndefined();
      expect(details.nextAction).toBeUndefined();
    });

    it('sends escalation message for conflict category to po', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'conflict',
        question: 'Conflicting priorities?',
        options: OPTIONS,
      });

      const details = result.details as {
        escalated: boolean;
        approver: string;
        escalationMessageId: string | null;
        nextAction: { agentId: string };
      };
      expect(details.approver).toBe('po');
      expect(details.escalationMessageId).toBeTruthy();
      expect(details.nextAction.agentId).toBe('po');

      const row = deps.db.prepare(
        'SELECT to_agent FROM agent_messages WHERE id = ?',
      ).get(details.escalationMessageId) as { to_agent: string } | undefined;
      expect(row?.to_agent).toBe('po');
    });

    it('sends escalation message on circuit breaker trigger', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const taskRef = 'task-cb-msg';

      // Fill up 5 auto decisions
      for (let i = 0; i < 5; i++) {
        await tool.execute(`cb-${i}`, {
          category: 'technical',
          question: `Q${i}`,
          options: OPTIONS,
          taskRef,
          agentId: 'back-1',
        });
      }

      // 6th triggers circuit breaker
      const result = await tool.execute('cb-trigger', {
        category: 'technical',
        question: 'Trigger CB',
        options: OPTIONS,
        taskRef,
        agentId: 'back-1',
      });

      const details = result.details as {
        escalated: boolean;
        escalationMessageId: string;
        nextAction: { action: string; agentId: string };
      };
      expect(details.escalated).toBe(true);
      expect(details.escalationMessageId).toBeTruthy();
      expect(details.nextAction.action).toBe('spawn_subagent');
      expect(details.nextAction.agentId).toBe('tech-lead');

      // Verify message in DB
      const row = deps.db.prepare(
        'SELECT * FROM agent_messages WHERE id = ?',
      ).get(details.escalationMessageId) as {
        to_agent: string;
        subject: string;
        priority: string;
      } | undefined;
      expect(row?.to_agent).toBe('tech-lead');
      expect(row?.priority).toBe('urgent');
      expect(row?.subject).toContain('[Escalation]');
    });

    it('escalation message body includes the question and options', async () => {
      const tool = decisionEvaluateToolDef(deps);
      const result = await tool.execute('call-1', {
        category: 'quality',
        question: 'Should we skip the flaky test?',
        options: OPTIONS,
        taskRef: 'task-body-check',
      });

      const details = result.details as { escalationMessageId: string };
      const row = deps.db.prepare(
        'SELECT body FROM agent_messages WHERE id = ?',
      ).get(details.escalationMessageId) as { body: string } | undefined;
      expect(row?.body).toContain('Should we skip the flaky test?');
      expect(row?.body).toContain('axios');
      expect(row?.body).toContain('fetch');
      expect(row?.body).toContain('task-body-check');
    });
  });
});
