/**
 * Tests for self-evaluation enforcement module.
 *
 * Task 0144 (EP21)
 */

import { describe, it, expect } from 'vitest';
import {
  stageRequiresEvaluation,
  parseSelfEvaluation,
  validateSelfEvaluation,
  DEFAULT_SELF_EVAL_CONFIG,
} from '../../src/orchestrator/self-evaluation.js';

describe('stageRequiresEvaluation', () => {
  it('requires evaluation for IMPLEMENTATION', () => {
    expect(stageRequiresEvaluation('IMPLEMENTATION')).toBe(true);
  });

  it('requires evaluation for QA', () => {
    expect(stageRequiresEvaluation('QA')).toBe(true);
  });

  it('requires evaluation for REVIEW', () => {
    expect(stageRequiresEvaluation('REVIEW')).toBe(true);
  });

  it('requires evaluation for DESIGN', () => {
    expect(stageRequiresEvaluation('DESIGN')).toBe(true);
  });

  it('does not require evaluation for IDEA', () => {
    expect(stageRequiresEvaluation('IDEA')).toBe(false);
  });

  it('does not require evaluation for ROADMAP', () => {
    expect(stageRequiresEvaluation('ROADMAP')).toBe(false);
  });

  it('does not require evaluation for REFINEMENT', () => {
    expect(stageRequiresEvaluation('REFINEMENT')).toBe(false);
  });

  it('does not require evaluation for SHIPPING', () => {
    expect(stageRequiresEvaluation('SHIPPING')).toBe(false);
  });

  it('does not require evaluation for DONE', () => {
    expect(stageRequiresEvaluation('DONE')).toBe(false);
  });
});

describe('parseSelfEvaluation', () => {
  it('parses a structured object', () => {
    const result = parseSelfEvaluation({
      confidence: 4,
      completeness: 5,
      risks: 'None',
      summary: 'All tests pass, 95% coverage',
    });
    expect(result).toEqual({
      confidence: 4,
      completeness: 5,
      risks: 'None',
      summary: 'All tests pass, 95% coverage',
    });
  });

  it('parses a string as summary with default scores', () => {
    const result = parseSelfEvaluation('Good work, all tests pass');
    expect(result).toEqual({
      confidence: 3,
      completeness: 3,
      risks: 'none specified',
      summary: 'Good work, all tests pass',
    });
  });

  it('returns null for empty string', () => {
    expect(parseSelfEvaluation('')).toBeNull();
    expect(parseSelfEvaluation('   ')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseSelfEvaluation(null)).toBeNull();
    expect(parseSelfEvaluation(undefined)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseSelfEvaluation({ confidence: 4 })).toBeNull();
    expect(parseSelfEvaluation({ confidence: 4, completeness: 3 })).toBeNull();
    expect(parseSelfEvaluation({ summary: 'text' })).toBeNull();
  });

  it('returns null when summary is empty string', () => {
    expect(parseSelfEvaluation({
      confidence: 4,
      completeness: 3,
      summary: '',
    })).toBeNull();
  });

  it('clamps confidence to 1-5 range', () => {
    const low = parseSelfEvaluation({ confidence: 0, completeness: 3, summary: 'test' });
    expect(low!.confidence).toBe(1);

    const high = parseSelfEvaluation({ confidence: 10, completeness: 3, summary: 'test' });
    expect(high!.confidence).toBe(5);
  });

  it('clamps completeness to 1-5 range', () => {
    const low = parseSelfEvaluation({ confidence: 3, completeness: -1, summary: 'test' });
    expect(low!.completeness).toBe(1);

    const high = parseSelfEvaluation({ confidence: 3, completeness: 8, summary: 'test' });
    expect(high!.completeness).toBe(5);
  });

  it('rounds fractional scores', () => {
    const result = parseSelfEvaluation({ confidence: 3.7, completeness: 2.3, summary: 'test' });
    expect(result!.confidence).toBe(4);
    expect(result!.completeness).toBe(2);
  });

  it('defaults risks to "none specified" when not provided', () => {
    const result = parseSelfEvaluation({ confidence: 3, completeness: 3, summary: 'test' });
    expect(result!.risks).toBe('none specified');
  });

  it('trims summary whitespace', () => {
    const result = parseSelfEvaluation('  lots of whitespace  ');
    expect(result!.summary).toBe('lots of whitespace');
  });
});

describe('validateSelfEvaluation', () => {
  it('passes for non-gated stages even without evaluation', () => {
    const failures = validateSelfEvaluation('IDEA', null);
    expect(failures).toHaveLength(0);
  });

  it('passes for non-gated stages with default config', () => {
    const failures = validateSelfEvaluation('ROADMAP', null, DEFAULT_SELF_EVAL_CONFIG);
    expect(failures).toHaveLength(0);
  });

  it('fails for IMPLEMENTATION without evaluation', () => {
    const failures = validateSelfEvaluation('IMPLEMENTATION', null);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.rule).toBe('self_evaluation_required');
    expect(failures[0]!.message).toContain('selfEvaluation');
  });

  it('fails for QA without evaluation', () => {
    const failures = validateSelfEvaluation('QA', null);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.rule).toBe('self_evaluation_required');
  });

  it('fails for DESIGN without evaluation', () => {
    const failures = validateSelfEvaluation('DESIGN', null);
    expect(failures).toHaveLength(1);
  });

  it('passes with valid evaluation for IMPLEMENTATION', () => {
    const eval_ = {
      confidence: 4,
      completeness: 4,
      risks: 'none',
      summary: 'All tests pass, coverage at 92%',
    };
    const failures = validateSelfEvaluation('IMPLEMENTATION', eval_);
    expect(failures).toHaveLength(0);
  });

  it('fails when confidence is below minimum', () => {
    const eval_ = {
      confidence: 1,
      completeness: 3,
      risks: 'some',
      summary: 'Partial implementation',
    };
    const failures = validateSelfEvaluation('IMPLEMENTATION', eval_);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.rule).toBe('confidence_too_low');
  });

  it('fails when completeness is below minimum', () => {
    const eval_ = {
      confidence: 3,
      completeness: 1,
      risks: 'some',
      summary: 'Partial implementation',
    };
    const failures = validateSelfEvaluation('IMPLEMENTATION', eval_);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.rule).toBe('completeness_too_low');
  });

  it('can fail both confidence and completeness', () => {
    const eval_ = {
      confidence: 1,
      completeness: 1,
      risks: 'many',
      summary: 'Bad work',
    };
    const failures = validateSelfEvaluation('IMPLEMENTATION', eval_);
    expect(failures).toHaveLength(2);
    expect(failures.map(f => f.rule)).toContain('confidence_too_low');
    expect(failures.map(f => f.rule)).toContain('completeness_too_low');
  });

  it('passes with disabled config', () => {
    const failures = validateSelfEvaluation('IMPLEMENTATION', null, {
      ...DEFAULT_SELF_EVAL_CONFIG,
      enabled: false,
    });
    expect(failures).toHaveLength(0);
  });

  it('respects custom minimum thresholds', () => {
    const eval_ = {
      confidence: 3,
      completeness: 3,
      risks: 'some',
      summary: 'OK work',
    };
    // With high thresholds, should fail
    const failures = validateSelfEvaluation('IMPLEMENTATION', eval_, {
      enabled: true,
      minConfidence: 4,
      minCompleteness: 4,
    });
    expect(failures).toHaveLength(2);

    // With low thresholds, should pass
    const pass = validateSelfEvaluation('IMPLEMENTATION', eval_, {
      enabled: true,
      minConfidence: 1,
      minCompleteness: 1,
    });
    expect(pass).toHaveLength(0);
  });
});
