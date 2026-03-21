/**
 * Round-Trip Tests
 *
 * Send typed messages via team_message, read via team_inbox.
 * Verify schema, headers, and payload integrity survive the round-trip.
 * EP13 Task 0098
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
import { CURRENT_PROTOCOL_VERSION } from '@openclaw/quality-contracts/schemas/protocol-header';

const NOW = '2026-03-01T12:00:00.000Z';

describe('protocol round-trip', () => {
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
    const generateId = () => `01RT_${String(++idCounter).padStart(10, '0')}`;
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
      agentConfig: [
        { id: 'pm', name: 'Product Manager', model: { primary: 'anthropic/claude-sonnet-4-6' } },
        { id: 'tech-lead', name: 'Tech Lead', model: { primary: 'anthropic/claude-opus-4-6' } },
      ],
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  it('round-trips a stage_handoff message with protocol headers', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    const body = JSON.stringify({
      _type: 'stage_handoff',
      taskId: 'T001',
      fromStage: 'DESIGN',
      toStage: 'IMPLEMENTATION',
    });

    const sendResult = await sendTool.execute('tc1', {
      to: 'tech-lead',
      subject: 'Stage Handoff',
      body,
      from: 'pm',
    });

    const sendDetails = sendResult.details as Record<string, unknown>;
    expect(sendDetails['delivered']).toBe(true);

    const inboxResult = await inboxTool.execute('tc2', { agentId: 'tech-lead' });
    const inboxDetails = inboxResult.details as { messages: Array<Record<string, unknown>> };
    expect(inboxDetails.messages).toHaveLength(1);

    const msg = inboxDetails.messages[0]!;
    const parsed = JSON.parse(msg['body'] as string) as Record<string, unknown>;

    // Verify protocol headers were injected
    expect(parsed['_protocol']).toBe(CURRENT_PROTOCOL_VERSION);
    expect(parsed['_sender']).toBe('pm');
    expect(parsed['_timestamp']).toBe(NOW);

    // Verify payload survived
    expect(parsed['_type']).toBe('stage_handoff');
    expect(parsed['taskId']).toBe('T001');
    expect(parsed['fromStage']).toBe('DESIGN');
    expect(parsed['toStage']).toBe('IMPLEMENTATION');
  });

  it('round-trips a review_request message', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    const body = JSON.stringify({
      _type: 'review_request',
      taskId: 'T002',
      reviewer: 'tech-lead',
      artifacts: { pr: 'https://github.com/pr/42' },
    });

    await sendTool.execute('tc1', { to: 'tech-lead', subject: 'Review', body, from: 'back-1' });

    const inboxResult = await inboxTool.execute('tc2', { agentId: 'tech-lead' });
    const msgs = (inboxResult.details as { messages: Array<Record<string, unknown>> }).messages;
    const parsed = JSON.parse(msgs[0]!['body'] as string) as Record<string, unknown>;

    expect(parsed['_protocol']).toBe(CURRENT_PROTOCOL_VERSION);
    expect(parsed['_sender']).toBe('back-1');
    expect(parsed['_type']).toBe('review_request');
    expect(parsed['taskId']).toBe('T002');
    expect((parsed['artifacts'] as Record<string, unknown>)['pr']).toBe('https://github.com/pr/42');
  });

  it('round-trips a qa_report message with numeric fields', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    const body = JSON.stringify({
      _type: 'qa_report',
      taskId: 'T003',
      total: 42,
      passed: 40,
      failed: 2,
    });

    await sendTool.execute('tc1', { to: 'pm', subject: 'QA Report', body, from: 'qa' });

    const inboxResult = await inboxTool.execute('tc2', { agentId: 'pm' });
    const msgs = (inboxResult.details as { messages: Array<Record<string, unknown>> }).messages;
    const parsed = JSON.parse(msgs[0]!['body'] as string) as Record<string, unknown>;

    expect(parsed['_protocol']).toBe(CURRENT_PROTOCOL_VERSION);
    expect(parsed['total']).toBe(42);
    expect(parsed['passed']).toBe(40);
    expect(parsed['failed']).toBe(2);
  });

  it('rejects invalid typed message body on send', async () => {
    const sendTool = teamMessageToolDef(deps);

    const body = JSON.stringify({
      _type: 'stage_handoff',
      // missing all required fields
    });

    const result = await sendTool.execute('tc1', {
      to: 'tech-lead',
      subject: 'Bad Handoff',
      body,
      from: 'pm',
    });

    const details = result.details as Record<string, unknown>;
    expect(details['delivered']).toBe(false);
    expect(String(details['reason'])).toContain('validation failed');
  });

  it('passes through plain text messages without validation', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    await sendTool.execute('tc1', {
      to: 'pm',
      subject: 'Hello',
      body: 'This is a plain text message, not JSON',
      from: 'tech-lead',
    });

    const inboxResult = await inboxTool.execute('tc2', { agentId: 'pm' });
    const msgs = (inboxResult.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!['body']).toBe('This is a plain text message, not JSON');
  });
});
