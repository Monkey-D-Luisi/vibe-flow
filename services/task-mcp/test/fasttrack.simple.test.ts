import { describe, it, expect } from 'vitest';
import { evaluateFastTrack, guardPostDev } from '../src/domain/FastTrack.js';

const baseTask = {
  id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
  title: 'Test Task',
  acceptance_criteria: ['AC'],
  scope: 'minor' as const,
  status: 'po' as const,
  rev: 0,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString()
};

describe('FastTrack domain helpers', () => {
  it('declares task eligible when all positive signals present', () => {
    const ctx = {
      task: baseTask,
      diff: { files: ['src/feature.ts'], locAdded: 40, locDeleted: 10 },
      quality: { coverage: 0.9, avgCyclomatic: 3, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };

    const result = evaluateFastTrack(ctx);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reasons).toContain('eligible');
    expect(result.hardBlocks).toHaveLength(0);
  });

  it('blocks fast-track when modules changed and returns hard block', () => {
    const ctx = {
      task: { ...baseTask, scope: 'minor' as const },
      diff: { files: ['security/auth.ts'], locAdded: 5, locDeleted: 1 },
      quality: { coverage: 0.95, avgCyclomatic: 2, lintErrors: 0 },
      metadata: {
        modulesChanged: true,
        publicApiChanged: false,
        contractsChanged: true
      }
    };

    const result = evaluateFastTrack(ctx);
    expect(result.eligible).toBe(false);
    expect(result.hardBlocks).toContain('modules_changed');
    expect(result.hardBlocks).toContain('contracts_changed');
  });

  it('revokes post-dev when coverage drops below threshold', () => {
    const ctx = {
      task: { ...baseTask, scope: 'major' as const, status: 'dev' as const },
      diff: { files: ['src/feature.ts'], locAdded: 20, locDeleted: 5 },
      quality: { coverage: 0.6, avgCyclomatic: 4, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };
    const result = guardPostDev(ctx);
    expect(result.revoke).toBe(true);
    expect(result.reason).toBe('coverage_below_threshold');
  });

  it('revokes post-dev when reviewer reports high severity issues', () => {
    const ctx = {
      task: { ...baseTask, status: 'dev' as const },
      diff: { files: ['src/feature.ts'], locAdded: 20, locDeleted: 5 },
      quality: { coverage: 0.9, avgCyclomatic: 4, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };
    const result = guardPostDev(ctx, [{ severity: 'high', rule: 'SEC-01' }]);
    expect(result.revoke).toBe(true);
    expect(result.reason).toBe('high_violations');
  });

  it('keeps fast-track when conditions remain valid', () => {
    const ctx = {
      task: { ...baseTask, status: 'dev' as const },
      diff: { files: ['src/feature.ts'], locAdded: 20, locDeleted: 5 },
      quality: { coverage: 0.9, avgCyclomatic: 4, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };
    const result = guardPostDev(ctx);
    expect(result.revoke).toBe(false);
  });
});
