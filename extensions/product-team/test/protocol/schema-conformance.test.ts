/**
 * Schema Conformance Tests
 *
 * Validates all 10 message type schemas accept valid payloads and reject invalid ones.
 * EP13 Task 0098
 */

import { describe, it, expect } from 'vitest';
import { validateMessageBody } from '@openclaw/quality-contracts/validation/message-validator';
import { MESSAGE_TYPES } from '@openclaw/quality-contracts/schemas/messages';

describe('schema conformance', () => {
  it('knows all 10 message types', () => {
    expect(MESSAGE_TYPES).toHaveLength(10);
    expect(MESSAGE_TYPES).toContain('stage_handoff');
    expect(MESSAGE_TYPES).toContain('review_request');
    expect(MESSAGE_TYPES).toContain('review_result');
    expect(MESSAGE_TYPES).toContain('qa_request');
    expect(MESSAGE_TYPES).toContain('qa_report');
    expect(MESSAGE_TYPES).toContain('design_request');
    expect(MESSAGE_TYPES).toContain('design_delivery');
    expect(MESSAGE_TYPES).toContain('escalation');
    expect(MESSAGE_TYPES).toContain('status_update');
    expect(MESSAGE_TYPES).toContain('budget_alert');
  });

  describe('stage_handoff', () => {
    const type = 'stage_handoff';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'stage_handoff',
        taskId: 'T001',
        fromStage: 'DESIGN',
        toStage: 'IMPLEMENTATION',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing required field', () => {
      const result = validateMessageBody(type, {
        _type: 'stage_handoff',
        taskId: 'T001',
        // missing fromStage, toStage
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('review_request', () => {
    const type = 'review_request';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'review_request',
        taskId: 'T001',
        reviewer: 'tech-lead',
        artifacts: { pr: 'https://github.com/pr/1' },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects wrong type', () => {
      const result = validateMessageBody(type, {
        _type: 'review_request',
        taskId: 123, // should be string
        reviewer: 'tech-lead',
        artifacts: {},
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('review_result', () => {
    const type = 'review_result';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'review_result',
        taskId: 'T001',
        reviewer: 'tech-lead',
        verdict: 'approved',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing taskId', () => {
      const result = validateMessageBody(type, {
        _type: 'review_result',
        reviewer: 'tech-lead',
        verdict: 'approved',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('qa_request', () => {
    const type = 'qa_request';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'qa_request',
        taskId: 'T001',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing taskId', () => {
      const result = validateMessageBody(type, {
        _type: 'qa_request',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('qa_report', () => {
    const type = 'qa_report';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'qa_report',
        taskId: 'T001',
        total: 42,
        passed: 40,
        failed: 2,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects wrong type for passed', () => {
      const result = validateMessageBody(type, {
        _type: 'qa_report',
        taskId: 'T001',
        total: 42,
        passed: 'yes', // should be number
        failed: 2,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('design_request', () => {
    const type = 'design_request';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'design_request',
        taskId: 'T001',
        brief: 'Design a login page',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing brief', () => {
      const result = validateMessageBody(type, {
        _type: 'design_request',
        taskId: 'T001',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('design_delivery', () => {
    const type = 'design_delivery';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'design_delivery',
        taskId: 'T001',
        screenIds: ['screen-001'],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing taskId', () => {
      const result = validateMessageBody(type, {
        _type: 'design_delivery',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('escalation', () => {
    const type = 'escalation';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'escalation',
        reason: 'Blocked on API design decision',
        category: 'technical',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing reason', () => {
      const result = validateMessageBody(type, {
        _type: 'escalation',
        category: 'technical',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('status_update', () => {
    const type = 'status_update';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'status_update',
        agentId: 'back-1',
        status: 'working',
        message: 'Implementing feature X',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects missing agentId', () => {
      const result = validateMessageBody(type, {
        _type: 'status_update',
        status: 'working',
        message: 'Implementing',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('budget_alert', () => {
    const type = 'budget_alert';
    it('accepts valid payload', () => {
      const result = validateMessageBody(type, {
        _type: 'budget_alert',
        scope: 'agent',
        consumed: 8500,
        limit: 10000,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects wrong type for consumed', () => {
      const result = validateMessageBody(type, {
        _type: 'budget_alert',
        scope: 'agent',
        consumed: 'high', // should be number
        limit: 10000,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('unknown types', () => {
    it('rejects unknown message type', () => {
      const result = validateMessageBody('unknown_type', { _type: 'unknown_type' });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Unknown message type');
    });
  });
});
