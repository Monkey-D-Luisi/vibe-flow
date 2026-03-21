import { describe, it, expect } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { MESSAGE_SCHEMAS, MESSAGE_TYPES } from '../../../src/schemas/messages/index.js';
import { StageHandoffBody } from '../../../src/schemas/messages/stage-handoff.js';
import { ReviewRequestBody } from '../../../src/schemas/messages/review-request.js';
import { ReviewResultBody } from '../../../src/schemas/messages/review-result.js';
import { QaRequestBody } from '../../../src/schemas/messages/qa-request.js';
import { QaReportBody } from '../../../src/schemas/messages/qa-report.js';
import { DesignRequestBody } from '../../../src/schemas/messages/design-request.js';
import { DesignDeliveryBody } from '../../../src/schemas/messages/design-delivery.js';
import { EscalationBody } from '../../../src/schemas/messages/escalation.js';
import { StatusUpdateBody } from '../../../src/schemas/messages/status-update.js';
import { BudgetAlertBody } from '../../../src/schemas/messages/budget-alert.js';
import { ProtocolEnvelope, MessageTypeEnum } from '../../../src/schemas/messages/protocol-types.js';

describe('MESSAGE_SCHEMAS registry', () => {
  it('contains all 10 message types', () => {
    expect(MESSAGE_SCHEMAS.size).toBe(10);
    for (const t of MESSAGE_TYPES) {
      expect(MESSAGE_SCHEMAS.has(t)).toBe(true);
    }
  });

  it('each schema is a valid TypeBox schema', () => {
    for (const [type, schema] of MESSAGE_SCHEMAS) {
      expect(() => TypeCompiler.Compile(schema)).not.toThrow();
      expect(type).toBeTruthy();
    }
  });
});

describe('ProtocolEnvelope schema', () => {
  const check = TypeCompiler.Compile(ProtocolEnvelope);

  it('accepts a valid envelope', () => {
    expect(check.Check({
      _protocol: '1.0.0',
      _type: 'stage_handoff',
      _sender: 'pm',
      _timestamp: '2026-03-15T10:00:00Z',
    })).toBe(true);
  });

  it('rejects envelope with missing _protocol', () => {
    expect(check.Check({
      _type: 'stage_handoff',
      _sender: 'pm',
      _timestamp: '2026-03-15T10:00:00Z',
    })).toBe(false);
  });

  it('rejects envelope with invalid _type', () => {
    expect(check.Check({
      _protocol: '1.0.0',
      _type: 'unknown_type',
      _sender: 'pm',
      _timestamp: '2026-03-15T10:00:00Z',
    })).toBe(false);
  });
});

describe('MessageTypeEnum', () => {
  const check = TypeCompiler.Compile(MessageTypeEnum);

  it('accepts all 10 message types', () => {
    for (const t of MESSAGE_TYPES) {
      expect(check.Check(t)).toBe(true);
    }
  });

  it('rejects unknown type', () => {
    expect(check.Check('unknown')).toBe(false);
  });
});

describe('StageHandoffBody', () => {
  const check = TypeCompiler.Compile(StageHandoffBody);

  it('accepts valid body', () => {
    expect(check.Check({
      _type: 'stage_handoff',
      taskId: 'TASK-001',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
    })).toBe(true);
  });

  it('accepts body with artifacts', () => {
    expect(check.Check({
      _type: 'stage_handoff',
      taskId: 'TASK-001',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
      artifacts: { prUrl: 'https://github.com/test/pr/1' },
    })).toBe(true);
  });

  it('rejects body with missing taskId', () => {
    expect(check.Check({
      _type: 'stage_handoff',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
    })).toBe(false);
  });

  it('rejects body with wrong _type', () => {
    expect(check.Check({
      _type: 'review_request',
      taskId: 'TASK-001',
      fromStage: 'IMPLEMENTATION',
      toStage: 'QA',
    })).toBe(false);
  });
});

describe('ReviewRequestBody', () => {
  const check = TypeCompiler.Compile(ReviewRequestBody);

  it('accepts valid body', () => {
    expect(check.Check({
      _type: 'review_request',
      taskId: 'TASK-001',
    })).toBe(true);
  });

  it('accepts body with optional fields', () => {
    expect(check.Check({
      _type: 'review_request',
      taskId: 'TASK-001',
      prUrl: 'https://github.com/test/pr/1',
      changedFiles: ['src/index.ts'],
      qualityReport: { tests: 'pass', coverage: 95 },
    })).toBe(true);
  });

  it('rejects body without taskId', () => {
    expect(check.Check({ _type: 'review_request' })).toBe(false);
  });
});

describe('ReviewResultBody', () => {
  const check = TypeCompiler.Compile(ReviewResultBody);

  it('accepts approved verdict', () => {
    expect(check.Check({
      _type: 'review_result',
      taskId: 'TASK-001',
      verdict: 'approved',
    })).toBe(true);
  });

  it('accepts changes_requested with violations', () => {
    expect(check.Check({
      _type: 'review_result',
      taskId: 'TASK-001',
      verdict: 'changes_requested',
      violations: [{ file: 'src/index.ts', line: 10, message: 'Unused import', severity: 'warning' }],
      summary: 'Minor issues found',
    })).toBe(true);
  });

  it('rejects invalid verdict', () => {
    expect(check.Check({
      _type: 'review_result',
      taskId: 'TASK-001',
      verdict: 'maybe',
    })).toBe(false);
  });
});

describe('QaRequestBody', () => {
  const check = TypeCompiler.Compile(QaRequestBody);

  it('accepts minimal body', () => {
    expect(check.Check({ _type: 'qa_request', taskId: 'TASK-001' })).toBe(true);
  });

  it('accepts body with scope and targets', () => {
    expect(check.Check({
      _type: 'qa_request',
      taskId: 'TASK-001',
      scope: 'integration',
      testTargets: ['src/tools/'],
    })).toBe(true);
  });

  it('rejects body without taskId', () => {
    expect(check.Check({ _type: 'qa_request' })).toBe(false);
  });
});

describe('QaReportBody', () => {
  const check = TypeCompiler.Compile(QaReportBody);

  it('accepts valid report', () => {
    expect(check.Check({
      _type: 'qa_report',
      taskId: 'TASK-001',
      total: 50,
      passed: 48,
      failed: 2,
    })).toBe(true);
  });

  it('accepts report with evidence', () => {
    expect(check.Check({
      _type: 'qa_report',
      taskId: 'TASK-001',
      total: 1,
      passed: 1,
      failed: 0,
      evidence: [{ name: 'test-1', result: 'pass' }],
    })).toBe(true);
  });

  it('rejects report with negative count', () => {
    expect(check.Check({
      _type: 'qa_report',
      taskId: 'TASK-001',
      total: -1,
      passed: 0,
      failed: 0,
    })).toBe(false);
  });
});

describe('DesignRequestBody', () => {
  const check = TypeCompiler.Compile(DesignRequestBody);

  it('accepts valid request', () => {
    expect(check.Check({
      _type: 'design_request',
      taskId: 'TASK-001',
      brief: 'Create a login page',
    })).toBe(true);
  });

  it('rejects request without brief', () => {
    expect(check.Check({ _type: 'design_request', taskId: 'TASK-001' })).toBe(false);
  });
});

describe('DesignDeliveryBody', () => {
  const check = TypeCompiler.Compile(DesignDeliveryBody);

  it('accepts valid delivery', () => {
    expect(check.Check({
      _type: 'design_delivery',
      taskId: 'TASK-001',
      screenIds: ['screen-1'],
      htmlPaths: ['/designs/login.html'],
    })).toBe(true);
  });

  it('accepts delivery without optional arrays', () => {
    expect(check.Check({ _type: 'design_delivery', taskId: 'TASK-001' })).toBe(true);
  });

  it('rejects delivery without taskId', () => {
    expect(check.Check({ _type: 'design_delivery' })).toBe(false);
  });
});

describe('EscalationBody', () => {
  const check = TypeCompiler.Compile(EscalationBody);

  it('accepts valid escalation', () => {
    expect(check.Check({
      _type: 'escalation',
      reason: 'Quality gate failed 3 times',
      category: 'blocker',
    })).toBe(true);
  });

  it('accepts escalation with context', () => {
    expect(check.Check({
      _type: 'escalation',
      taskId: 'TASK-001',
      reason: 'Build failing',
      category: 'quality',
      context: { failures: 3, lastError: 'type error' },
    })).toBe(true);
  });

  it('rejects escalation without reason', () => {
    expect(check.Check({ _type: 'escalation', category: 'blocker' })).toBe(false);
  });
});

describe('StatusUpdateBody', () => {
  const check = TypeCompiler.Compile(StatusUpdateBody);

  it('accepts valid status', () => {
    expect(check.Check({
      _type: 'status_update',
      agentId: 'back-1',
      status: 'working',
      currentTask: 'TASK-001',
    })).toBe(true);
  });

  it('rejects invalid status value', () => {
    expect(check.Check({
      _type: 'status_update',
      agentId: 'back-1',
      status: 'sleeping',
    })).toBe(false);
  });
});

describe('BudgetAlertBody', () => {
  const check = TypeCompiler.Compile(BudgetAlertBody);

  it('accepts valid alert', () => {
    expect(check.Check({
      _type: 'budget_alert',
      scope: 'pipeline',
      consumed: 8000,
      limit: 10000,
      recommendation: 'Downgrade to copilot-proxy',
    })).toBe(true);
  });

  it('rejects alert with missing scope', () => {
    expect(check.Check({
      _type: 'budget_alert',
      consumed: 8000,
      limit: 10000,
    })).toBe(false);
  });

  it('rejects alert with negative consumed', () => {
    expect(check.Check({
      _type: 'budget_alert',
      scope: 'agent',
      consumed: -1,
      limit: 5000,
    })).toBe(false);
  });
});
