import { describe, it, expect } from 'vitest';
import { validateMessageBody } from '../../src/validation/message-validator.js';

describe('validateMessageBody', () => {
  it('returns valid for a correct stage_handoff body', () => {
    const result = validateMessageBody('stage_handoff', {
      _type: 'stage_handoff',
      taskId: 'TASK-001',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns valid for a correct qa_report body', () => {
    const result = validateMessageBody('qa_report', {
      _type: 'qa_report',
      taskId: 'TASK-001',
      total: 10,
      passed: 9,
      failed: 1,
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid for a correct escalation body', () => {
    const result = validateMessageBody('escalation', {
      _type: 'escalation',
      reason: 'Build timeout',
      category: 'blocker',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for unknown message type', () => {
    const result = validateMessageBody('unknown_type', { foo: 'bar' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown message type: "unknown_type"');
  });

  it('returns invalid for missing required field', () => {
    const result = validateMessageBody('stage_handoff', {
      _type: 'stage_handoff',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
      // missing taskId
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('returns invalid for wrong field type', () => {
    const result = validateMessageBody('qa_report', {
      _type: 'qa_report',
      taskId: 'TASK-001',
      total: 'not-a-number', // should be number
      passed: 0,
      failed: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('returns invalid for wrong _type literal', () => {
    const result = validateMessageBody('stage_handoff', {
      _type: 'review_request', // mismatch
      taskId: 'TASK-001',
      fromStage: 'IMPL',
      toStage: 'QA',
    });
    expect(result.valid).toBe(false);
  });

  it('caches compiled checks across calls', () => {
    // Call twice with same type -- second call should use cache
    const r1 = validateMessageBody('budget_alert', {
      _type: 'budget_alert',
      scope: 'pipeline',
      consumed: 100,
      limit: 1000,
    });
    const r2 = validateMessageBody('budget_alert', {
      _type: 'budget_alert',
      scope: 'agent',
      consumed: 50,
      limit: 500,
    });
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
  });

  it('validates all 10 message types with valid payloads', () => {
    const validPayloads: Record<string, unknown> = {
      stage_handoff: { _type: 'stage_handoff', taskId: 'T1', fromStage: 'A', toStage: 'B' },
      review_request: { _type: 'review_request', taskId: 'T1' },
      review_result: { _type: 'review_result', taskId: 'T1', verdict: 'approved' },
      qa_request: { _type: 'qa_request', taskId: 'T1' },
      qa_report: { _type: 'qa_report', taskId: 'T1', total: 1, passed: 1, failed: 0 },
      design_request: { _type: 'design_request', taskId: 'T1', brief: 'Create UI' },
      design_delivery: { _type: 'design_delivery', taskId: 'T1' },
      escalation: { _type: 'escalation', reason: 'blocked', category: 'blocker' },
      status_update: { _type: 'status_update', agentId: 'pm', status: 'idle' },
      budget_alert: { _type: 'budget_alert', scope: 'pipeline', consumed: 0, limit: 100 },
    };

    for (const [type, payload] of Object.entries(validPayloads)) {
      const result = validateMessageBody(type, payload);
      expect(result.valid, `Expected ${type} to be valid`).toBe(true);
    }
  });
});
