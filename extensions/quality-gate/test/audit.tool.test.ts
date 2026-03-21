import { describe, it, expect } from 'vitest';
import { evaluateGate } from '@openclaw/quality-contracts/gate/policy';
import { DEFAULT_POLICIES } from '@openclaw/quality-contracts/gate/types';

describe('gate integration - audit critical check', () => {
  it('passes when critical vulnerabilities within limit', () => {
    const result = evaluateGate(
      { auditCritical: 0 },
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('pass');
  });

  it('fails when critical vulnerabilities exceed limit', () => {
    const result = evaluateGate(
      { auditCritical: 2 },
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('fail');
  });

  it('skips when metric not provided', () => {
    const result = evaluateGate(
      {},
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('skip');
  });

  it('is not included when policy field is undefined', () => {
    const result = evaluateGate({}, {});
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeUndefined();
  });
});

describe('gate integration - audit high check', () => {
  it('passes when high vulnerabilities within limit', () => {
    const result = evaluateGate(
      { auditHigh: 3 },
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('pass');
  });

  it('fails when high vulnerabilities exceed limit', () => {
    const result = evaluateGate(
      { auditHigh: 10 },
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('fail');
  });

  it('skips when metric not provided', () => {
    const result = evaluateGate(
      {},
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check!.verdict).toBe('skip');
  });

  it('is not included when policy field is undefined', () => {
    const result = evaluateGate({}, {});
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeUndefined();
  });
});

describe('gate integration - combined audit + overall verdict', () => {
  it('fails overall when critical audit fails', () => {
    const result = evaluateGate(
      { auditCritical: 1, auditHigh: 0 },
      { auditMaxCritical: 0, auditMaxHigh: 5 },
    );
    expect(result.verdict).toBe('fail');
  });

  it('passes overall when both audit checks pass', () => {
    const result = evaluateGate(
      { auditCritical: 0, auditHigh: 2 },
      { auditMaxCritical: 0, auditMaxHigh: 5 },
    );
    expect(result.verdict).toBe('pass');
  });
});

describe('default policies - audit thresholds', () => {
  it('major policy has 0 max critical and 0 max high', () => {
    expect(DEFAULT_POLICIES.major.auditMaxCritical).toBe(0);
    expect(DEFAULT_POLICIES.major.auditMaxHigh).toBe(0);
  });

  it('minor policy has 0 max critical and 5 max high', () => {
    expect(DEFAULT_POLICIES.minor.auditMaxCritical).toBe(0);
    expect(DEFAULT_POLICIES.minor.auditMaxHigh).toBe(5);
  });

  it('patch policy has 0 max critical and 10 max high', () => {
    expect(DEFAULT_POLICIES.patch.auditMaxCritical).toBe(0);
    expect(DEFAULT_POLICIES.patch.auditMaxHigh).toBe(10);
  });
});
