/**
 * Version Negotiation Tests
 *
 * Tests protocol version compatibility checking on message read.
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
import { ensureMessagesTable, MESSAGES_TABLE } from '../../src/tools/shared-db.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { CURRENT_PROTOCOL_VERSION } from '@openclaw/quality-contracts/schemas/protocol-header';

const NOW = '2026-03-01T12:00:00.000Z';

describe('version negotiation', () => {
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
    const generateId = () => `01VN_${String(++idCounter).padStart(10, '0')}`;
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
      agentConfig: [],
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  it('same version (1.0.0 vs 1.0.0) has no warning', async () => {
    const sendTool = teamMessageToolDef(deps);
    const inboxTool = teamInboxToolDef(deps);

    await sendTool.execute('tc1', {
      to: 'reader',
      subject: 'Test',
      body: JSON.stringify({ _type: 'status_update', agentId: 'pm', status: 'idle', message: 'ok' }),
      from: 'sender',
    });

    const result = await inboxTool.execute('tc2', { agentId: 'reader' });
    const msgs = (result.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!['_versionWarning']).toBeUndefined();
  });

  it('minor version difference (1.0.0 vs 1.1.0) has no warning', async () => {
    ensureMessagesTable(deps);
    // Directly insert a message with version 1.1.0
    db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'VN-001',
      'sender',
      'reader',
      'Test',
      JSON.stringify({ _type: 'status_update', _protocol: '1.1.0', _sender: 'sender', agentId: 'pm', status: 'idle', message: 'ok' }),
      'normal',
      NOW,
    );

    const inboxTool = teamInboxToolDef(deps);
    const result = await inboxTool.execute('tc2', { agentId: 'reader' });
    const msgs = (result.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    // Same major → forward compatible, no warning
    expect(msgs[0]!['_versionWarning']).toBeUndefined();
  });

  it('major version mismatch (1.0.0 vs 2.0.0) triggers warning', async () => {
    ensureMessagesTable(deps);
    db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'VN-002',
      'sender',
      'reader',
      'Test',
      JSON.stringify({ _type: 'status_update', _protocol: '2.0.0', _sender: 'sender', agentId: 'pm', status: 'idle', message: 'ok' }),
      'normal',
      NOW,
    );

    const inboxTool = teamInboxToolDef(deps);
    const result = await inboxTool.execute('tc2', { agentId: 'reader' });
    const msgs = (result.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!['_versionWarning']).toContain('Protocol version mismatch');
    expect(msgs[0]!['_versionWarning']).toContain('sender=2.0.0');
    expect(msgs[0]!['_versionWarning']).toContain(`receiver=${CURRENT_PROTOCOL_VERSION}`);
  });

  it('typed message without _protocol header triggers legacy warning', async () => {
    ensureMessagesTable(deps);
    db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'VN-003',
      'sender',
      'reader',
      'Test',
      JSON.stringify({ _type: 'status_update', agentId: 'pm', status: 'idle', message: 'ok' }),
      'normal',
      NOW,
    );

    const inboxTool = teamInboxToolDef(deps);
    const result = await inboxTool.execute('tc2', { agentId: 'reader' });
    const msgs = (result.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!['_versionWarning']).toContain('legacy format');
  });

  it('plain text messages have no version warning', async () => {
    ensureMessagesTable(deps);
    db.prepare(`
      INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('VN-004', 'sender', 'reader', 'Test', 'just plain text', 'normal', NOW);

    const inboxTool = teamInboxToolDef(deps);
    const result = await inboxTool.execute('tc2', { agentId: 'reader' });
    const msgs = (result.details as { messages: Array<Record<string, unknown>> }).messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!['_versionWarning']).toBeUndefined();
  });
});
