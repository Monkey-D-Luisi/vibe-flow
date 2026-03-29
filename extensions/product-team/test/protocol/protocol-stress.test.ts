/**
 * Protocol Stress Tests
 *
 * Tests concurrent messaging, large payloads, and burst traffic scenarios
 * that require a database and messaging tools.
 * EP16 Task 0111
 */

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
import { teamMessageToolDef, teamInboxToolDef } from '../../src/tools/team-messaging.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { validateMessageBody } from '@openclaw/quality-contracts/validation/message-validator';
import { MESSAGE_TYPES } from '@openclaw/quality-contracts/schemas/messages';

const NOW = '2026-06-01T12:00:00.000Z';

/**
 * Valid payload factories for all 10 message types.
 * Each returns the minimal valid body for its type.
 */
const VALID_PAYLOADS: Record<string, () => Record<string, unknown>> = {
  stage_handoff: () => ({ _type: 'stage_handoff', taskId: 'T001', fromStage: 'DESIGN', toStage: 'IMPLEMENTATION' }),
  review_request: () => ({ _type: 'review_request', taskId: 'T001' }),
  review_result: () => ({ _type: 'review_result', taskId: 'T001', verdict: 'approved' }),
  qa_request: () => ({ _type: 'qa_request', taskId: 'T001' }),
  qa_report: () => ({ _type: 'qa_report', taskId: 'T001', total: 10, passed: 9, failed: 1 }),
  design_request: () => ({ _type: 'design_request', taskId: 'T001', brief: 'Design login page' }),
  design_delivery: () => ({ _type: 'design_delivery', taskId: 'T001' }),
  escalation: () => ({ _type: 'escalation', reason: 'Blocked', category: 'technical' }),
  status_update: () => ({ _type: 'status_update', agentId: 'back-1', status: 'working' }),
  budget_alert: () => ({ _type: 'budget_alert', scope: 'agent', consumed: 5000, limit: 10000 }),
};

/** Agents used in concurrent tests. */
const AGENTS = ['pm', 'po', 'tech-lead', 'designer', 'back-1', 'front-1', 'qa', 'devops'];

function createDeps(db: Database.Database): { deps: ToolDeps; idCounter: { value: number } } {
  const idCounter = { value: 0 };
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01PR_${String(++idCounter.value).padStart(10, '0')}`;
  const now = () => NOW;
  const eventLog = new EventLog(eventRepo, generateId, now);

  return {
    deps: {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      agentConfig: AGENTS.map((id) => ({
        id,
        name: id,
        model: { primary: 'anthropic/claude-sonnet-4-6' },
      })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    idCounter,
  };
}

// ---------------------------------------------------------------------------
// 1. Concurrent messaging — parallel send/receive
// ---------------------------------------------------------------------------
describe('concurrent messaging', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(() => {
    db = createTestDatabase();
    ({ deps } = createDeps(db));
  });

  afterEach(() => db?.close());

  it('8 agents send 10 messages each concurrently without errors', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    const promises = AGENTS.flatMap((sender) =>
      Array.from({ length: 10 }, (_, i) =>
        sendTool.execute(`tc-${sender}-${i}`, {
          to: AGENTS[(AGENTS.indexOf(sender) + 1) % AGENTS.length]!,
          subject: `Msg ${i}`,
          body: JSON.stringify({
            _type: 'status_update',
            agentId: sender,
            status: 'working',
            progress: `Step ${i}`,
          }),
          from: sender,
        }),
      ),
    );

    const results = await Promise.all(promises);
    const failures = results.filter(
      (r) => (r.details as Record<string, unknown>)['delivered'] !== true,
    );
    expect(failures).toHaveLength(0);

    // Each agent should have received 10 messages from its predecessor
    for (const agent of AGENTS) {
      const inbox = await inboxTool.execute(`inbox-${agent}`, { agentId: agent });
      const msgs = (inbox.details as { messages: unknown[] }).messages;
      expect(msgs.length).toBe(10);
    }
  });

  it('mixed message types in concurrent burst', async () => {
    const sendTool = teamMessageToolDef(deps);
    const types = MESSAGE_TYPES.slice(0, 8); // one type per agent

    const promises = AGENTS.map((sender, i) => {
      const msgType = types[i % types.length]!;
      const body = VALID_PAYLOADS[msgType]!();
      return sendTool.execute(`tc-mix-${i}`, {
        to: AGENTS[(i + 1) % AGENTS.length]!,
        subject: `Mixed ${msgType}`,
        body: JSON.stringify(body),
        from: sender,
      });
    });

    const results = await Promise.all(promises);
    const delivered = results.filter(
      (r) => (r.details as Record<string, unknown>)['delivered'] === true,
    );
    expect(delivered.length).toBe(AGENTS.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Large payloads — messages over 100KB
// ---------------------------------------------------------------------------
describe('large payloads', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(() => {
    db = createTestDatabase();
    ({ deps } = createDeps(db));
  });

  afterEach(() => db?.close());

  it('validates a 100KB payload without crashing', () => {
    const body = {
      _type: 'escalation',
      reason: 'x'.repeat(100_000),
      category: 'oversize',
    };
    const result = validateMessageBody('escalation', body);
    expect(result.valid).toBe(true);
  });

  it('rejects oversized message via messaging tools (body > 2000 chars)', async () => {
    const sendTool = teamMessageToolDef(deps);

    const largeBody = JSON.stringify({
      _type: 'escalation',
      reason: 'A'.repeat(2000),
      category: 'capacity',
    });

    // Messaging tool enforces a 2000-char body limit — may throw or return not-delivered
    let rejected = false;
    try {
      const sendResult = await sendTool.execute('tc-large', {
        to: 'pm',
        subject: 'Large message',
        body: largeBody,
        from: 'qa',
      });
      rejected = (sendResult.details as Record<string, unknown>)['delivered'] === false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Expected: tool rejects oversized body with a ValidationError
      expect(message).toBeTruthy();
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it('sends a message at the body size limit', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    // Build a body that fits within 2000 chars after JSON.stringify
    const payload = {
      _type: 'escalation',
      reason: 'R'.repeat(1900),
      category: 'cap',
    };
    const body = JSON.stringify(payload);
    expect(body.length).toBeLessThanOrEqual(2000);

    const sendResult = await sendTool.execute('tc-limit', {
      to: 'pm',
      subject: 'Limit message',
      body,
      from: 'qa',
    });
    expect((sendResult.details as Record<string, unknown>)['delivered']).toBe(true);

    const inboxResult = await inboxTool.execute('tc-limit-read', { agentId: 'pm' });
    const msgs = (inboxResult.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
  });

  it('validates a payload with deeply nested optional artifacts', () => {
    const body = {
      _type: 'stage_handoff',
      taskId: 'T001',
      fromStage: 'DESIGN',
      toStage: 'IMPLEMENTATION',
      artifacts: Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [`key${i}`, { value: i, nested: { deep: true } }]),
      ),
    };
    const result = validateMessageBody('stage_handoff', body);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Rate limiting / burst traffic — 100+ messages per second
// ---------------------------------------------------------------------------
describe('burst traffic', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(() => {
    db = createTestDatabase();
    ({ deps } = createDeps(db));
  });

  afterEach(() => db?.close());

  it('sends 100 messages in a rapid burst without errors', async () => {
    const sendTool = teamMessageToolDef(deps);
    const COUNT = 100;

    const promises = Array.from({ length: COUNT }, (_, i) =>
      sendTool.execute(`tc-burst-${i}`, {
        to: 'pm',
        subject: `Burst ${i}`,
        body: JSON.stringify({
          _type: 'status_update',
          agentId: AGENTS[i % AGENTS.length]!,
          status: 'working',
          progress: `Burst message ${i}`,
        }),
        from: AGENTS[i % AGENTS.length]!,
      }),
    );

    const results = await Promise.all(promises);
    const deliveredCount = results.filter(
      (r) => (r.details as Record<string, unknown>)['delivered'] === true,
    ).length;

    expect(deliveredCount).toBe(COUNT);
  });

  it('100 validations in sequence complete quickly', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const msgType = MESSAGE_TYPES[i % MESSAGE_TYPES.length]!;
      const factory = VALID_PAYLOADS[msgType];
      if (factory) {
        validateMessageBody(msgType, factory());
      }
    }
    const elapsed = performance.now() - start;
    // Should complete well under 1 second
    expect(elapsed).toBeLessThan(1000);
  });

  it('inbox correctly returns all burst messages', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);
    const COUNT = 50;

    const promises = Array.from({ length: COUNT }, (_, i) =>
      sendTool.execute(`tc-inbox-burst-${i}`, {
        to: 'tech-lead',
        subject: `Inbox burst ${i}`,
        body: JSON.stringify({
          _type: 'status_update',
          agentId: 'pm',
          status: 'working',
          progress: `Item ${i}`,
        }),
        from: 'pm',
      }),
    );

    await Promise.all(promises);

    const inboxResult = await inboxTool.execute('tc-inbox-read', { agentId: 'tech-lead' });
    const msgs = (inboxResult.details as { messages: unknown[] }).messages;
    expect(msgs.length).toBe(COUNT);
  });
});
