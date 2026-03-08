import { describe, it, expect } from 'vitest';
import {
  scoreComplexity,
  DEFAULT_CONFIG,
  type ComplexityInput,
  type ComplexityConfig,
  type ComplexityScore,
} from '../src/complexity-scorer.js';

describe('scoreComplexity', () => {
  /* ---------------------------------------------------------------- */
  /*  Basic behaviour                                                  */
  /* ---------------------------------------------------------------- */

  it('returns a ComplexityScore with score, tier, and factors', () => {
    const result = scoreComplexity({});
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('factors');
    expect(typeof result.score).toBe('number');
    expect(['low', 'medium', 'high']).toContain(result.tier);
    expect(Array.isArray(result.factors)).toBe(true);
  });

  it('defaults to minor scope when no input is provided', () => {
    const result = scoreComplexity({});
    expect(result.score).toBe(DEFAULT_CONFIG.scopeScores['minor']);
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0].name).toBe('scope');
  });

  it('is deterministic for the same inputs', () => {
    const input: ComplexityInput = {
      scope: 'major',
      stage: 'IMPLEMENTATION',
      agentRole: 'back-1',
      stageDurationMs: 50000,
      stageMedianDurationMs: 20000,
      filesChanged: 25,
    };
    const results = Array.from({ length: 100 }, () => scoreComplexity(input));
    const first = results[0];
    for (const r of results) {
      expect(r.score).toBe(first.score);
      expect(r.tier).toBe(first.tier);
      expect(r.factors).toEqual(first.factors);
    }
  });

  /* ---------------------------------------------------------------- */
  /*  Scope scoring                                                    */
  /* ---------------------------------------------------------------- */

  describe('scope scoring', () => {
    it('scores patch as lowest', () => {
      const result = scoreComplexity({ scope: 'patch' });
      expect(result.score).toBe(10);
      expect(result.tier).toBe('low');
    });

    it('scores minor at 20', () => {
      const result = scoreComplexity({ scope: 'minor' });
      expect(result.score).toBe(20);
      expect(result.tier).toBe('low');
    });

    it('scores major at 50', () => {
      const result = scoreComplexity({ scope: 'major' });
      expect(result.score).toBe(50);
      expect(result.tier).toBe('medium');
    });

    it('scores critical at 80', () => {
      const result = scoreComplexity({ scope: 'critical' });
      expect(result.score).toBe(80);
      expect(result.tier).toBe('high');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Stage modifiers                                                  */
  /* ---------------------------------------------------------------- */

  describe('stage modifiers', () => {
    it('reduces score for IDEA stage', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'IDEA' });
      expect(result.score).toBe(20 - 10); // 10
    });

    it('reduces score for ROADMAP stage', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'ROADMAP' });
      expect(result.score).toBe(20 - 10); // 10
    });

    it('increases score for IMPLEMENTATION stage', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'IMPLEMENTATION' });
      expect(result.score).toBe(20 + 15); // 35
    });

    it('increases score for REVIEW stage', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'REVIEW' });
      expect(result.score).toBe(20 + 15); // 35
    });

    it('adds zero for DESIGN stage (no factor emitted)', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'DESIGN' });
      expect(result.score).toBe(20);
      const stageFactor = result.factors.find(f => f.name === 'stage');
      expect(stageFactor).toBeUndefined();
    });

    it('handles unknown stage gracefully', () => {
      const result = scoreComplexity({ scope: 'minor', stage: 'UNKNOWN' as never });
      expect(result.score).toBe(20);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Role modifiers                                                   */
  /* ---------------------------------------------------------------- */

  describe('role modifiers', () => {
    it('reduces score for pm role', () => {
      const result = scoreComplexity({ scope: 'minor', agentRole: 'pm' });
      expect(result.score).toBe(20 - 10); // 10
    });

    it('increases score for tech-lead role', () => {
      const result = scoreComplexity({ scope: 'minor', agentRole: 'tech-lead' });
      expect(result.score).toBe(20 + 15); // 35
    });

    it('increases score for back-1 role', () => {
      const result = scoreComplexity({ scope: 'minor', agentRole: 'back-1' });
      expect(result.score).toBe(20 + 10); // 30
    });

    it('adds zero for designer role (no factor emitted)', () => {
      const result = scoreComplexity({ scope: 'minor', agentRole: 'designer' });
      expect(result.score).toBe(20);
      const roleFactor = result.factors.find(f => f.name === 'role');
      expect(roleFactor).toBeUndefined();
    });

    it('handles unknown role gracefully', () => {
      const result = scoreComplexity({ scope: 'minor', agentRole: 'unknown' as never });
      expect(result.score).toBe(20);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Historical duration overrun                                      */
  /* ---------------------------------------------------------------- */

  describe('historical duration overrun', () => {
    it('adds bonus when duration exceeds 2x median', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 50000,
        stageMedianDurationMs: 20000,
      });
      expect(result.score).toBe(20 + 10); // 30
      const factor = result.factors.find(f => f.name === 'history_overrun');
      expect(factor).toBeDefined();
      expect(factor!.points).toBe(10);
    });

    it('does not add bonus when duration is exactly 2x median', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 40000,
        stageMedianDurationMs: 20000,
      });
      expect(result.score).toBe(20);
    });

    it('does not add bonus when duration is below 2x median', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 30000,
        stageMedianDurationMs: 20000,
      });
      expect(result.score).toBe(20);
    });

    it('handles missing stageDurationMs gracefully', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageMedianDurationMs: 20000,
      });
      expect(result.score).toBe(20);
    });

    it('handles missing stageMedianDurationMs gracefully', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 50000,
      });
      expect(result.score).toBe(20);
    });

    it('handles zero median gracefully (no division by zero)', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 50000,
        stageMedianDurationMs: 0,
      });
      expect(result.score).toBe(20);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Files changed                                                    */
  /* ---------------------------------------------------------------- */

  describe('files changed', () => {
    it('adds bonus for 10+ files changed', () => {
      const result = scoreComplexity({ scope: 'minor', filesChanged: 15 });
      expect(result.score).toBe(20 + 5); // 25
    });

    it('adds bonus proportional to file count', () => {
      const result = scoreComplexity({ scope: 'minor', filesChanged: 35 });
      // 35 / 10 = 3.5 → floor(3) * 5 = 15
      expect(result.score).toBe(20 + 15); // 35
    });

    it('adds nothing for fewer than 10 files', () => {
      const result = scoreComplexity({ scope: 'minor', filesChanged: 9 });
      expect(result.score).toBe(20);
    });

    it('adds nothing for zero files', () => {
      const result = scoreComplexity({ scope: 'minor', filesChanged: 0 });
      expect(result.score).toBe(20);
    });

    it('handles missing filesChanged gracefully', () => {
      const result = scoreComplexity({ scope: 'minor' });
      expect(result.score).toBe(20);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Clamping                                                         */
  /* ---------------------------------------------------------------- */

  describe('clamping', () => {
    it('clamps score to minimum 0', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 5, major: 5, patch: 5, critical: 5 },
        stageModifiers: { IDEA: -50 },
        roleModifiers: { pm: -50 },
      };
      const result = scoreComplexity(
        { scope: 'minor', stage: 'IDEA', agentRole: 'pm' },
        config,
      );
      expect(result.score).toBe(0);
      expect(result.tier).toBe('low');
    });

    it('clamps score to maximum 100', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 90, major: 90, patch: 90, critical: 90 },
        stageModifiers: { IMPLEMENTATION: 50 },
        roleModifiers: { 'tech-lead': 50 },
      };
      const result = scoreComplexity(
        { scope: 'minor', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
        config,
      );
      expect(result.score).toBe(100);
      expect(result.tier).toBe('high');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Tier derivation                                                  */
  /* ---------------------------------------------------------------- */

  describe('tier derivation', () => {
    it('returns low for score 0', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 0, major: 0, patch: 0, critical: 0 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('low');
    });

    it('returns low for score at boundary (33)', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 33, major: 33, patch: 33, critical: 33 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('low');
    });

    it('returns medium for score just above low boundary (34)', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 34, major: 34, patch: 34, critical: 34 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('medium');
    });

    it('returns medium for score at medium boundary (66)', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 66, major: 66, patch: 66, critical: 66 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('medium');
    });

    it('returns high for score just above medium boundary (67)', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 67, major: 67, patch: 67, critical: 67 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('high');
    });

    it('supports custom tier boundaries', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        tierBoundaries: [20, 50],
      };
      expect(scoreComplexity({ scope: 'minor' }, config).tier).toBe('low'); // 20 <= 20
      expect(scoreComplexity({ scope: 'major' }, config).tier).toBe('medium'); // 50 <= 50
      expect(scoreComplexity({ scope: 'critical' }, config).tier).toBe('high'); // 80 > 50
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Custom configuration                                             */
  /* ---------------------------------------------------------------- */

  describe('custom configuration', () => {
    it('respects custom scope scores', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { minor: 42, major: 42, patch: 42, critical: 42 },
      };
      expect(scoreComplexity({ scope: 'minor' }, config).score).toBe(42);
    });

    it('respects custom stage modifiers', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        stageModifiers: { IDEA: 25 },
      };
      expect(scoreComplexity({ scope: 'minor', stage: 'IDEA' }, config).score).toBe(20 + 25);
    });

    it('respects custom role modifiers', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        roleModifiers: { pm: 30 },
      };
      expect(scoreComplexity({ scope: 'minor', agentRole: 'pm' }, config).score).toBe(20 + 30);
    });

    it('respects custom history overrun bonus', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        historyOverrunBonus: 25,
      };
      const result = scoreComplexity({
        scope: 'minor',
        stageDurationMs: 50000,
        stageMedianDurationMs: 20000,
      }, config);
      expect(result.score).toBe(20 + 25);
    });

    it('respects custom files changed weight', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        filesChangedPer10: 12,
      };
      const result = scoreComplexity({ scope: 'minor', filesChanged: 20 }, config);
      expect(result.score).toBe(20 + 24); // 2 * 12
    });

    it('respects zero filesChangedPer10 (disables files factor)', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        filesChangedPer10: 0,
      };
      const result = scoreComplexity({ scope: 'minor', filesChanged: 100 }, config);
      expect(result.score).toBe(20);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Combined scoring                                                 */
  /* ---------------------------------------------------------------- */

  describe('combined scoring', () => {
    it('combines all factors correctly', () => {
      const result = scoreComplexity({
        scope: 'major',
        stage: 'IMPLEMENTATION',
        agentRole: 'back-1',
        stageDurationMs: 50000,
        stageMedianDurationMs: 20000,
        filesChanged: 25,
      });
      // scope: 50 + stage: 15 + role: 10 + history: 10 + files: floor(25/10)*5 = 10
      expect(result.score).toBe(95);
      expect(result.tier).toBe('high');
      expect(result.factors).toHaveLength(5);
    });

    it('produces a typical low-complexity scenario', () => {
      const result = scoreComplexity({
        scope: 'patch',
        stage: 'IDEA',
        agentRole: 'pm',
      });
      // scope: 10 + stage: -10 + role: -10 = -10 → clamped to 0
      expect(result.score).toBe(0);
      expect(result.tier).toBe('low');
    });

    it('produces a typical medium-complexity scenario', () => {
      const result = scoreComplexity({
        scope: 'minor',
        stage: 'IMPLEMENTATION',
        agentRole: 'front-1',
      });
      // scope: 20 + stage: 15 + role: 10 = 45
      expect(result.score).toBe(45);
      expect(result.tier).toBe('medium');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Factors documentation                                            */
  /* ---------------------------------------------------------------- */

  describe('factors documentation', () => {
    it('includes descriptive factor names', () => {
      const result = scoreComplexity({
        scope: 'major',
        stage: 'IMPLEMENTATION',
        agentRole: 'back-1',
        stageDurationMs: 50000,
        stageMedianDurationMs: 20000,
        filesChanged: 25,
      });
      const names = result.factors.map(f => f.name);
      expect(names).toContain('scope');
      expect(names).toContain('stage');
      expect(names).toContain('role');
      expect(names).toContain('history_overrun');
      expect(names).toContain('files_changed');
    });

    it('includes human-readable descriptions', () => {
      const result = scoreComplexity({ scope: 'major', stage: 'IMPLEMENTATION' });
      for (const factor of result.factors) {
        expect(typeof factor.description).toBe('string');
        expect(factor.description.length).toBeGreaterThan(0);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Purity verification                                              */
  /* ---------------------------------------------------------------- */

  describe('purity', () => {
    it('does not mutate the input object', () => {
      const input: ComplexityInput = {
        scope: 'major',
        stage: 'IMPLEMENTATION',
        agentRole: 'back-1',
      };
      const frozen = Object.freeze({ ...input });
      // Should not throw
      const result = scoreComplexity(frozen);
      expect(result.score).toBeGreaterThan(0);
    });

    it('does not mutate the config object', () => {
      const config: ComplexityConfig = {
        ...DEFAULT_CONFIG,
        scopeScores: { ...DEFAULT_CONFIG.scopeScores },
        stageModifiers: { ...DEFAULT_CONFIG.stageModifiers },
        roleModifiers: { ...DEFAULT_CONFIG.roleModifiers },
        tierBoundaries: [...DEFAULT_CONFIG.tierBoundaries],
      };
      const configSnapshot = JSON.stringify(config);
      scoreComplexity({ scope: 'major', stage: 'IMPLEMENTATION' }, config);
      expect(JSON.stringify(config)).toBe(configSnapshot);
    });
  });
});
