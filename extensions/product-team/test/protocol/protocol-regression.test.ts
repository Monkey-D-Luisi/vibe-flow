/**
 * Protocol Regression Test Suite
 *
 * Stress-tests the message protocol with fuzz payloads, concurrent messaging,
 * invalid inputs, version mismatches, large payloads, and burst traffic.
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
import {
  checkVersionCompatibility,
  parseVersion,
  CURRENT_PROTOCOL_VERSION,
} from '@openclaw/quality-contracts/schemas/protocol-header';

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
// 1. Schema Fuzz — random payloads per message type
// ---------------------------------------------------------------------------
describe('schema fuzz', () => {
  /** Mutators that break payloads in realistic ways. */
  const MUTATIONS: Array<{
    name: string;
    mutate: (payload: Record<string, unknown>) => Record<string, unknown>;
  }> = [
    { name: 'null-all-strings', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string') out[k] = null;
      }
      return out;
    }},
    { name: 'numbers-to-strings', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'number') out[k] = String(out[k]);
      }
      return out;
    }},
    { name: 'empty-strings', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && k !== '_type') out[k] = '';
      }
      return out;
    }},
    { name: 'delete-random-key', mutate: (p) => {
      const out = { ...p };
      const keys = Object.keys(out).filter((k) => k !== '_type');
      if (keys.length > 0) {
        delete out[keys[Math.floor(Math.random() * keys.length)]!];
      }
      return out;
    }},
    { name: 'add-extra-keys', mutate: (p) => ({
      ...p,
      __extra_noise: 'unexpected',
      __extra_number: 999,
    })},
    { name: 'swap-type', mutate: (p) => ({ ...p, _type: 'unknown_type' }) },
    { name: 'array-instead-of-string', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && k !== '_type') { out[k] = ['a', 'b']; break; }
      }
      return out;
    }},
    { name: 'negative-numbers', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'number') out[k] = -1;
      }
      return out;
    }},
    { name: 'boolean-injection', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && k !== '_type') { out[k] = true; break; }
      }
      return out;
    }},
    { name: 'nested-object', mutate: (p) => {
      const out = { ...p };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'string' && k !== '_type') { out[k] = { nested: { deep: true } }; break; }
      }
      return out;
    }},
  ];

  for (const msgType of MESSAGE_TYPES) {
    describe(msgType, () => {
      it('accepts its valid factory payload', () => {
        const factory = VALID_PAYLOADS[msgType];
        expect(factory, `missing factory for ${msgType}`).toBeDefined();
        const result = validateMessageBody(msgType, factory!());
        expect(result.valid).toBe(true);
      });

      for (const { name, mutate } of MUTATIONS) {
        it(`mutation: ${name}`, () => {
          const factory = VALID_PAYLOADS[msgType];
          if (!factory) return;
          const mutated = mutate(factory());
          const result = validateMessageBody(msgType, mutated);
          // Mutation may or may not break the schema — we just assert no crash
          expect(typeof result.valid).toBe('boolean');
          if (!result.valid) {
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
          }
        });
      }
    });
  }

  it('every MESSAGE_TYPE has a valid factory', () => {
    for (const msgType of MESSAGE_TYPES) {
      expect(VALID_PAYLOADS[msgType], `missing factory for ${msgType}`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Concurrent messaging — 8 agents sending simultaneously
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
// 3. Invalid payloads — clear error messages
// ---------------------------------------------------------------------------
describe('invalid payloads', () => {
  it('completely empty object', () => {
    const result = validateMessageBody('stage_handoff', {});
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('null body', () => {
    const result = validateMessageBody('stage_handoff', null);
    expect(result.valid).toBe(false);
  });

  it('undefined body', () => {
    const result = validateMessageBody('stage_handoff', undefined);
    expect(result.valid).toBe(false);
  });

  it('numeric body', () => {
    const result = validateMessageBody('stage_handoff', 42);
    expect(result.valid).toBe(false);
  });

  it('string body', () => {
    const result = validateMessageBody('stage_handoff', 'not an object');
    expect(result.valid).toBe(false);
  });

  it('array body', () => {
    const result = validateMessageBody('stage_handoff', [1, 2, 3]);
    expect(result.valid).toBe(false);
  });

  it('wrong _type discriminator', () => {
    const body = { ...VALID_PAYLOADS['stage_handoff']!(), _type: 'qa_report' };
    const result = validateMessageBody('stage_handoff', body);
    expect(result.valid).toBe(false);
  });

  it('missing all required fields for each type', () => {
    for (const msgType of MESSAGE_TYPES) {
      const result = validateMessageBody(msgType, { _type: msgType });
      // Some types only require _type (e.g. qa_request needs taskId), check the result is deterministic
      expect(typeof result.valid).toBe('boolean');
      if (!result.valid) {
        expect(result.errors!.length).toBeGreaterThan(0);
      }
    }
  });

  it('unknown type returns clear error message', () => {
    const result = validateMessageBody('nonexistent_type', { _type: 'nonexistent_type' });
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain('Unknown message type');
    expect(result.errors![0]).toContain('nonexistent_type');
  });

  it('SQL injection in field values does not crash', () => {
    const body = {
      _type: 'stage_handoff',
      taskId: "'; DROP TABLE messages; --",
      fromStage: 'DESIGN',
      toStage: 'IMPLEMENTATION',
    };
    const result = validateMessageBody('stage_handoff', body);
    // SQL injection string is still a valid string for the schema
    expect(result.valid).toBe(true);
  });

  it('XSS-like payload in string fields does not crash', () => {
    const body = {
      _type: 'escalation',
      reason: '<script>alert("xss")</script>',
      category: '<img onerror=alert(1) src=x>',
    };
    const result = validateMessageBody('escalation', body);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Version compatibility — mismatch scenarios
// ---------------------------------------------------------------------------
describe('version compatibility', () => {
  it('exact match is compatible', () => {
    const result = checkVersionCompatibility('1.0.0', '1.0.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('exact_match');
  });

  it('minor forward compat (1.0.0 → 1.1.0)', () => {
    const result = checkVersionCompatibility('1.0.0', '1.1.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('minor_forward_compat');
  });

  it('minor backward compat (1.2.0 → 1.0.0)', () => {
    const result = checkVersionCompatibility('1.2.0', '1.0.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('minor_forward_compat');
  });

  it('patch difference is compatible', () => {
    const result = checkVersionCompatibility('1.0.0', '1.0.3');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('minor_forward_compat');
  });

  it('major mismatch (1.x → 2.x)', () => {
    const result = checkVersionCompatibility('1.0.0', '2.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });

  it('major mismatch (2.x → 1.x)', () => {
    const result = checkVersionCompatibility('2.0.0', '1.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });

  it('large version numbers', () => {
    const result = checkVersionCompatibility('99.0.0', '99.88.77');
    expect(result.compatible).toBe(true);
  });

  it('invalid sender version', () => {
    const result = checkVersionCompatibility('not-a-version', '1.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });

  it('invalid receiver version', () => {
    const result = checkVersionCompatibility('1.0.0', 'abc');
    expect(result.compatible).toBe(false);
  });

  it('both invalid versions', () => {
    const result = checkVersionCompatibility('', '');
    expect(result.compatible).toBe(false);
  });

  it('parseVersion handles edge cases', () => {
    expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseVersion('not-valid')).toBeUndefined();
    expect(parseVersion('')).toBeUndefined();
    expect(parseVersion('1.0')).toBeUndefined();
    expect(parseVersion('1.0.0.0')).toBeUndefined();
    expect(parseVersion('v1.0.0')).toBeUndefined();
  });

  it('CURRENT_PROTOCOL_VERSION is a valid semver', () => {
    const parsed = parseVersion(CURRENT_PROTOCOL_VERSION);
    expect(parsed).toBeDefined();
    expect(parsed!.major).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Large payloads — messages over 100KB
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
    } catch {
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
// 6. Rate limiting / burst traffic — 100+ messages per second
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
