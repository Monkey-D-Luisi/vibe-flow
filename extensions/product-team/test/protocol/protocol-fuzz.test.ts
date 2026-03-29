/**
 * Protocol Fuzz & Validation Tests
 *
 * Tests schema validation with fuzz mutations, invalid payloads, and version
 * compatibility edge cases. Pure validation — no DB or messaging tools needed.
 * EP16 Task 0111
 */

import { describe, it, expect } from 'vitest';
import { validateMessageBody } from '@openclaw/quality-contracts/validation/message-validator';
import { MESSAGE_TYPES } from '@openclaw/quality-contracts/schemas/messages';
import {
  checkVersionCompatibility,
  parseVersion,
  CURRENT_PROTOCOL_VERSION,
} from '@openclaw/quality-contracts/schemas/protocol-header';

/**
 * Valid payload factories for all 10 message types.
 * Each returns the minimal valid body for its type.
 */
export const VALID_PAYLOADS: Record<string, () => Record<string, unknown>> = {
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
// 2. Invalid payloads — clear error messages
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
// 3. Version compatibility — mismatch scenarios
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
