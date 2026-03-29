/**
 * Tests for decision-buttons module.
 *
 * Task 0142 (EP21)
 */

import { describe, it, expect } from 'vitest';
import {
  buildDecisionButtons,
  formatDecisionCard,
  extractDecisionData,
} from '../src/decision-buttons.js';

describe('buildDecisionButtons', () => {
  it('builds one approve button per option plus a reject button', () => {
    const buttons = buildDecisionButtons('DEC-001', ['option-a', 'option-b']);
    expect(buttons).toHaveLength(3); // 2 approve rows + 1 reject row
    expect(buttons[0]![0]!.text).toBe('✅ option-a');
    expect(buttons[0]![0]!.callback_data).toBe('dec:approve:DEC-001:option-a');
    expect(buttons[1]![0]!.text).toBe('✅ option-b');
    expect(buttons[1]![0]!.callback_data).toBe('dec:approve:DEC-001:option-b');
    expect(buttons[2]![0]!.text).toBe('❌ Reject');
    expect(buttons[2]![0]!.callback_data).toBe('dec:reject:DEC-001');
  });

  it('handles a single option', () => {
    const buttons = buildDecisionButtons('DEC-002', ['yes']);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]![0]!.callback_data).toBe('dec:approve:DEC-002:yes');
    expect(buttons[1]![0]!.text).toBe('❌ Reject');
  });

  it('truncates long decision IDs to 20 chars', () => {
    const longId = 'a'.repeat(30);
    const buttons = buildDecisionButtons(longId, ['ok']);
    // Should use last 20 chars
    expect(buttons[0]![0]!.callback_data).toContain('a'.repeat(20));
    expect(buttons[0]![0]!.callback_data).not.toContain('a'.repeat(21));
  });

  it('truncates long option IDs to 16 chars', () => {
    const longOption = 'b'.repeat(25);
    const buttons = buildDecisionButtons('DEC-003', [longOption]);
    expect(buttons[0]![0]!.callback_data).toContain('b'.repeat(16));
    expect(buttons[0]![0]!.callback_data).not.toContain('b'.repeat(17));
    // Display text still shows full option
    expect(buttons[0]![0]!.text).toBe(`✅ ${longOption}`);
  });

  it('ensures callback_data does not exceed 64 bytes', () => {
    const longId = 'x'.repeat(20);
    const longOption = 'y'.repeat(16);
    const buttons = buildDecisionButtons(longId, [longOption]);
    for (const row of buttons) {
      for (const btn of row) {
        expect(btn.callback_data.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it('returns only a reject button when options array is empty', () => {
    const buttons = buildDecisionButtons('DEC-004', []);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]![0]!.text).toBe('❌ Reject');
  });
});

describe('formatDecisionCard', () => {
  it('renders a basic decision card with all fields', () => {
    const card = formatDecisionCard({
      decisionId: 'DEC-001',
      category: 'architecture',
      question: 'Should we use Redis or PostgreSQL?',
      options: ['redis', 'postgresql'],
      approver: 'tech-lead',
      agentId: 'back-1',
      taskId: 'TASK-0099',
    });

    expect(card).toContain('Decision Escalated');
    expect(card).toContain('DEC\\-001');
    expect(card).toContain('architecture');
    expect(card).toContain('Redis or PostgreSQL');
    expect(card).toContain('TASK\\-0099');
    expect(card).toContain('back\\-1');
    expect(card).toContain('redis');
    expect(card).toContain('postgresql');
    expect(card).toContain('/approve');
    expect(card).toContain('/reject');
  });

  it('omits optional fields when not provided', () => {
    const card = formatDecisionCard({
      decisionId: 'DEC-002',
      category: 'general',
      question: 'Which approach?',
      options: ['a'],
      approver: null,
    });

    expect(card).not.toContain('Task:');
    expect(card).not.toContain('From:');
    expect(card).not.toContain('Context:');
    expect(card).toContain('/approve');
  });

  it('includes budget and pipeline context when provided', () => {
    const card = formatDecisionCard({
      decisionId: 'DEC-003',
      category: 'cost',
      question: 'Budget exceeded, proceed?',
      options: ['yes'],
      approver: 'pm',
      budgetPct: 85,
      activePipelines: 3,
    });

    expect(card).toContain('85% used');
    expect(card).toContain('3 active');
  });

  it('handles empty options array', () => {
    const card = formatDecisionCard({
      decisionId: 'DEC-004',
      category: 'test',
      question: 'Proceed?',
      options: [],
      approver: null,
    });

    // Should not have Options section
    expect(card).not.toContain('Options:');
    // Should still have reject command
    expect(card).toContain('/reject');
  });
});

describe('extractDecisionData', () => {
  it('extracts data from a standard escalated decision result', () => {
    const data = extractDecisionData(
      { agentId: 'back-1', taskId: 'T-001' },
      {
        details: {
          escalated: true,
          decisionId: 'DEC-010',
          category: 'architecture',
          question: 'Use gRPC or REST?',
          approver: 'tech-lead',
          options: ['grpc', 'rest'],
        },
      },
    );

    expect(data).not.toBeNull();
    expect(data!.decisionId).toBe('DEC-010');
    expect(data!.category).toBe('architecture');
    expect(data!.question).toBe('Use gRPC or REST?');
    expect(data!.options).toEqual(['grpc', 'rest']);
    expect(data!.approver).toBe('tech-lead');
    expect(data!.agentId).toBe('back-1');
    expect(data!.taskId).toBe('T-001');
  });

  it('returns null when escalated is false', () => {
    const data = extractDecisionData(
      {},
      { details: { escalated: false, decisionId: 'DEC-011' } },
    );
    expect(data).toBeNull();
  });

  it('returns null when escalated is missing', () => {
    const data = extractDecisionData({}, { details: { decisionId: 'DEC-012' } });
    expect(data).toBeNull();
  });

  it('handles flat result without details wrapper', () => {
    const data = extractDecisionData(
      {},
      {
        escalated: true,
        decisionId: 'DEC-013',
        category: 'test',
        question: 'Proceed?',
        approver: 'pm',
        options: ['yes', 'no'],
      },
    );

    expect(data).not.toBeNull();
    expect(data!.decisionId).toBe('DEC-013');
    expect(data!.options).toEqual(['yes', 'no']);
  });

  it('provides default approve option when no options available', () => {
    const data = extractDecisionData(
      {},
      { escalated: true, decisionId: 'DEC-014', category: 'test', question: 'Q?' },
    );

    expect(data).not.toBeNull();
    expect(data!.options).toEqual(['approve']);
  });

  it('extracts option IDs from object-shaped options', () => {
    const data = extractDecisionData(
      {},
      {
        escalated: true,
        decisionId: 'DEC-015',
        category: 'design',
        question: 'Choose layout?',
        options: [
          { id: 'grid', label: 'Grid Layout' },
          { id: 'flex', label: 'Flexbox Layout' },
        ],
      },
    );

    expect(data).not.toBeNull();
    expect(data!.options).toEqual(['grid', 'flex']);
  });

  it('falls back to params for missing result fields', () => {
    const data = extractDecisionData(
      {
        decisionId: 'DEC-016',
        category: 'from-params',
        question: 'Param question?',
      },
      { escalated: true },
    );

    expect(data).not.toBeNull();
    expect(data!.decisionId).toBe('DEC-016');
    expect(data!.category).toBe('from-params');
    expect(data!.question).toBe('Param question?');
  });
});
