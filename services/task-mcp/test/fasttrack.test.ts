import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateFastTrack, guardPostDev, FastTrackContext } from '../src/domain/FastTrack.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';

describe('FastTrack Evaluation', () => {
  let baseTask: TaskRecord;
  let baseContext: FastTrackContext;

  beforeEach(() => {
    baseTask = {
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po',
      rev: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    };

    baseContext = {
      task: baseTask,
      diff: {
        files: ['src/feature.ts'],
        locAdded: 50,
        locDeleted: 10
      },
      quality: {
        coverage: 0.85,
        avgCyclomatic: 4.0,
        lintErrors: 0
      },
      metadata: {
        modulesChanged: false,
        publicApiChanged: false
      }
    };
  });

  describe('evaluateFastTrack', () => {
    it('should be eligible for minor scope with good metrics', () => {
      const result = evaluateFastTrack(baseContext);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.reasons).toContain('scope_minor');
      expect(result.reasons).toContain('eligible');
    });

    it('should be eligible for tests/docs only changes', () => {
      const ctx = {
        ...baseContext,
        diff: {
          ...baseContext.diff,
          files: ['src/test.spec.ts', 'docs/README.md']
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(true);
      expect(result.reasons).toContain('only_tests_docs');
    });

    it('should reject major scope by default', () => {
      const ctx = {
        ...baseContext,
        task: { ...baseTask, scope: 'major' as const }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.score).toBeLessThan(60);
    });

    it('should reject if public API changed', () => {
      const ctx = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          publicApiChanged: true
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('public_api');
    });

    it('should reject if modules changed', () => {
      const ctx = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          modulesChanged: true
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('modules_changed');
    });

    it('should reject sensitive paths', () => {
      const sensitivePaths = [
        'security/auth.ts',
        'payments/service.ts',
        'infra/database.ts',
        'migrations/001.sql'
      ];

      for (const path of sensitivePaths) {
        const ctx = {
          ...baseContext,
          diff: {
            ...baseContext.diff,
            files: [path]
          }
        };
        const result = evaluateFastTrack(ctx);
        expect(result.eligible).toBe(false);
        expect(result.hardBlocks).toContain('sensitive_path');
      }
    });

    it('should reject schema changes', () => {
      const ctx = {
        ...baseContext,
        diff: {
          ...baseContext.diff,
          files: ['packages/schemas/taskrecord.schema.json']
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('schema_change');
    });

    it('should reject if contracts exist', () => {
      const ctx = {
        ...baseContext,
        task: {
          ...baseTask,
          contracts: [{ name: 'TestContract', methods: ['test'] }]
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('contracts_touched');
    });

    it('should reject if ADR required', () => {
      const ctx = {
        ...baseContext,
        task: {
          ...baseTask,
          adr_id: 'ADR-001'
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('adr_required');
    });

    it('should reject if lint errors exist', () => {
      const ctx = {
        ...baseContext,
        quality: {
          ...baseContext.quality,
          lintErrors: 1
        }
      };
      const result = evaluateFastTrack(ctx);
      expect(result.eligible).toBe(false);
      expect(result.hardBlocks).toContain('lint_errors');
    });

    it('should calculate score correctly', () => {
      // Test scoring components
      const result = evaluateFastTrack(baseContext);
      expect(result.score).toBe(40 + 15 + 10 + 5); // scope_minor + diff_small + complexity_ok + no_modules_changed
    });
  });

  describe('guardPostDev', () => {
    it('should not revoke if still eligible', () => {
      const result = guardPostDev(baseContext);
      expect(result.revoke).toBe(false);
    });

    it('should revoke if no longer eligible', () => {
      const ctx = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          publicApiChanged: true
        }
      };
      const result = guardPostDev(ctx);
      expect(result.revoke).toBe(true);
      expect(result.reason).toBe('public_api');
    });

    it('should revoke if high violations', () => {
      const violations = [
        { severity: 'high', rule: 'test' },
        { severity: 'low', rule: 'test2' }
      ];
      const result = guardPostDev(baseContext, violations);
      expect(result.revoke).toBe(true);
      expect(result.reason).toBe('high_violations');
    });

    it('should revoke if coverage below threshold for minor scope', () => {
      const ctx = {
        ...baseContext,
        quality: {
          ...baseContext.quality,
          coverage: 0.65 // Below 0.7 for minor
        }
      };
      const result = guardPostDev(ctx);
      expect(result.revoke).toBe(true);
      expect(result.reason).toBe('coverage_below_threshold');
    });

    it('should revoke if coverage below threshold for major scope', () => {
      const ctx = {
        ...baseContext,
        task: { ...baseTask, scope: 'major' as const },
        quality: {
          ...baseContext.quality,
          coverage: 0.75 // Below 0.8 for major
        }
      };
      const result = guardPostDev(ctx);
      expect(result.revoke).toBe(true);
      expect(result.reason).toBe('coverage_below_threshold');
    });
  });
});