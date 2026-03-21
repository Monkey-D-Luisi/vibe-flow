import { describe, it, expect } from 'vitest';
import { evaluateGate } from '@openclaw/quality-contracts/gate/policy';
import { DEFAULT_POLICIES } from '@openclaw/quality-contracts/gate/types';
import { parseAuditJson, parsePnpmAuditJson, parseNpmAuditJson, auditToolDef } from '../src/tools/audit.js';

describe('parsePnpmAuditJson', () => {
  it('parses valid pnpm audit output', () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 1, high: 2, moderate: 3, low: 4 } },
    });
    const result = parsePnpmAuditJson(raw);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(2);
    expect(result.moderate).toBe(3);
    expect(result.low).toBe(4);
    expect(result.total).toBe(10);
    expect(result.raw).toBeUndefined();
  });

  it('returns raw on malformed JSON', () => {
    const result = parsePnpmAuditJson('not json at all');
    expect(result.total).toBe(0);
    expect(result.raw).toBe('not json at all');
  });

  it('returns raw when metadata is missing', () => {
    const raw = JSON.stringify({ advisories: {} });
    const result = parsePnpmAuditJson(raw);
    expect(result.total).toBe(0);
    expect(result.raw).toBe(raw);
  });
});

describe('parseNpmAuditJson', () => {
  it('parses valid npm audit output', () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 2, low: 3, total: 99 } },
    });
    const result = parseNpmAuditJson(raw);
    expect(result.critical).toBe(0);
    expect(result.high).toBe(1);
    expect(result.moderate).toBe(2);
    expect(result.low).toBe(3);
    expect(result.total).toBe(6);
    expect(result.raw).toBeUndefined();
  });

  it('returns raw on empty string', () => {
    const result = parseNpmAuditJson('');
    expect(result.total).toBe(0);
    expect(result.raw).toBe('');
  });

  it('returns raw when vulnerabilities key missing', () => {
    const raw = JSON.stringify({ metadata: { dependencies: 100 } });
    const result = parseNpmAuditJson(raw);
    expect(result.total).toBe(0);
    expect(result.raw).toBe(raw);
  });
});

describe('gate integration - audit critical check', () => {
  it('passes when critical vulnerabilities within limit', () => {
    const result = evaluateGate(
      { auditCritical: 0 },
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('pass');
  });

  it('passes at exact boundary (auditCritical equals auditMaxCritical)', () => {
    const result = evaluateGate(
      { auditCritical: 2 },
      { auditMaxCritical: 2 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('pass');
  });

  it('fails when critical vulnerabilities exceed limit', () => {
    const result = evaluateGate(
      { auditCritical: 2 },
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('fail');
  });

  it('skips when metric not provided', () => {
    const result = evaluateGate(
      {},
      { auditMaxCritical: 0 },
    );
    const check = result.checks.find(c => c.name === 'audit-critical');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('skip');
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
    expect(check?.verdict).toBe('pass');
  });

  it('passes at exact boundary (auditHigh equals auditMaxHigh)', () => {
    const result = evaluateGate(
      { auditHigh: 5 },
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('pass');
  });

  it('fails when high vulnerabilities exceed limit', () => {
    const result = evaluateGate(
      { auditHigh: 10 },
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('fail');
  });

  it('skips when metric not provided', () => {
    const result = evaluateGate(
      {},
      { auditMaxHigh: 5 },
    );
    const check = result.checks.find(c => c.name === 'audit-high');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('skip');
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

  it('fails overall when high audit fails but critical passes', () => {
    const result = evaluateGate(
      { auditCritical: 0, auditHigh: 10 },
      { auditMaxCritical: 0, auditMaxHigh: 5 },
    );
    expect(result.verdict).toBe('fail');
  });
});

describe('parseAuditJson (canonical)', () => {
  it('parses standard audit metadata', () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 2, high: 3, moderate: 1, low: 0 } },
    });
    const result = parseAuditJson(raw);
    expect(result.critical).toBe(2);
    expect(result.high).toBe(3);
    expect(result.total).toBe(6);
  });

  it('handles missing vulnerability counts gracefully', () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 1 } },
    });
    const result = parseAuditJson(raw);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(0);
    expect(result.moderate).toBe(0);
    expect(result.low).toBe(0);
    expect(result.total).toBe(1);
  });
});

describe('auditToolDef.execute validation', () => {
  it('rejects invalid packageManager enum', async () => {
    await expect(
      auditToolDef.execute('test-id', { packageManager: 'yarn' }),
    ).rejects.toThrow();
  });

  it('rejects non-string cwd', async () => {
    await expect(
      auditToolDef.execute('test-id', { cwd: 42 }),
    ).rejects.toThrow();
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
