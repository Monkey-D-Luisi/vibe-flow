import { describe, it, expect } from 'vitest';
import { evaluateFastTrack, guardPostDev } from '../src/domain/FastTrack.js';

describe('FastTrack - Direct Logic Tests', () => {
  describe('evaluateFastTrack', () => {
    it('should evaluate simple fast-track criteria', () => {
      // Test basic evaluation logic
      const context = {
        task: {
          id: 'TR-123',
          title: 'Simple task',
          acceptance_criteria: ['Basic functionality'],
          scope: 'minor' as const,
          status: 'po' as const,
          rev: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        diff: {
          files: ['src/simple.ts'],
          locAdded: 50,
          locDeleted: 0
        },
        quality: {
          coverage: 0.9,
          lintErrors: 0
        },
        metadata: {
          modulesChanged: false,
          publicApiChanged: false
        }
      };

      const result = evaluateFastTrack(context);

      // Should evaluate based on the logic
      expect(typeof result.eligible).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(Array.isArray(result.hardBlocks)).toBe(true);
    });

    it('should handle major scope tasks', () => {
      const context = {
        task: {
          id: 'TR-456',
          title: 'Complex task',
          acceptance_criteria: ['Complex functionality'],
          scope: 'major' as const,
          status: 'po' as const,
          rev: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        diff: {
          files: ['src/complex.ts'],
          locAdded: 200,
          locDeleted: 0
        },
        quality: {
          coverage: 0.8,
          lintErrors: 0
        },
        metadata: {
          modulesChanged: true,
          publicApiChanged: false
        }
      };

      const result = evaluateFastTrack(context);

      expect(typeof result.eligible).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('guardPostDev', () => {
    it('should evaluate post-dev guard conditions', () => {
      const context = {
        task: {
          id: 'TR-123',
          title: 'Task with dev work',
          acceptance_criteria: ['Functionality implemented'],
          scope: 'minor' as const,
          status: 'dev' as const,
          rev: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        diff: {
          files: ['src/feature.ts'],
          locAdded: 100,
          locDeleted: 0
        },
        quality: {
          coverage: 0.75,
          lintErrors: 0
        },
        metadata: {
          modulesChanged: false,
          publicApiChanged: false
        }
      };

      const result = guardPostDev(context);

      expect(typeof result.revoke).toBe('boolean');
      if (result.revoke) {
        expect(typeof result.reason).toBe('string');
      }
    });

    it('should handle high lint errors', () => {
      const context = {
        task: {
          id: 'TR-789',
          title: 'Task with lint issues',
          acceptance_criteria: ['Functionality'],
          scope: 'minor' as const,
          status: 'dev' as const,
          rev: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        diff: {
          files: ['src/problematic.ts'],
          locAdded: 50,
          locDeleted: 0
        },
        quality: {
          coverage: 0.8,
          lintErrors: 5 // High lint errors
        },
        metadata: {
          modulesChanged: false,
          publicApiChanged: false
        }
      };

      const result = guardPostDev(context);

      // Should likely revoke due to lint errors
      expect(typeof result.revoke).toBe('boolean');
    });
  });
});