import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseReviewViolations,
  buildReviewLoopState,
  formatRepairBrief,
  buildReviewRound,
  isReviewLoopExhausted,
  formatEscalationMessage,
  countBlockingViolations,
  type ReviewViolation,
} from '../../src/orchestrator/review-loop.js';

// ── parseReviewViolations ──

describe('parseReviewViolations', () => {
  it('parses well-formed violations', () => {
    const result = parseReviewViolations({
      violations: [
        { severity: 'high', message: 'Missing error handling', file: 'src/index.ts', line: 42 },
        { severity: 'low', message: 'Naming convention', suggestion: 'Use camelCase' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      severity: 'high',
      message: 'Missing error handling',
      file: 'src/index.ts',
      line: 42,
      suggestion: undefined,
    });
    expect(result[1]).toEqual({
      severity: 'low',
      message: 'Naming convention',
      file: undefined,
      line: undefined,
      suggestion: 'Use camelCase',
    });
  });

  it('returns empty array when no violations key', () => {
    expect(parseReviewViolations({})).toEqual([]);
  });

  it('returns empty array when violations is not an array', () => {
    expect(parseReviewViolations({ violations: 'none' })).toEqual([]);
  });

  it('filters out non-object entries', () => {
    const result = parseReviewViolations({
      violations: ['not an object', null, { severity: 'medium', message: 'Valid' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Valid');
  });

  it('defaults unknown severity to medium', () => {
    const result = parseReviewViolations({
      violations: [{ severity: 'unknown', message: 'Test' }],
    });
    expect(result[0].severity).toBe('medium');
  });

  it('defaults missing severity to medium', () => {
    const result = parseReviewViolations({
      violations: [{ message: 'No severity' }],
    });
    expect(result[0].severity).toBe('medium');
  });

  it('defaults missing message to "Unknown violation"', () => {
    const result = parseReviewViolations({
      violations: [{ severity: 'high' }],
    });
    expect(result[0].message).toBe('Unknown violation');
  });
});

// ── buildReviewLoopState ──

describe('buildReviewLoopState', () => {
  it('builds state with all fields', () => {
    const rounds = [buildReviewRound(1, [])];
    const state = buildReviewLoopState('task-1', 'Test task', 1, 3, rounds);
    expect(state.taskId).toBe('task-1');
    expect(state.title).toBe('Test task');
    expect(state.currentRound).toBe(1);
    expect(state.maxRounds).toBe(3);
    expect(state.rounds).toHaveLength(1);
  });
});

// ── buildReviewRound ──

describe('buildReviewRound', () => {
  it('creates a round with timestamp', () => {
    const violations: ReviewViolation[] = [
      { severity: 'high', message: 'test' },
    ];
    const round = buildReviewRound(2, violations, 'Some improvements');
    expect(round.round).toBe(2);
    expect(round.violations).toHaveLength(1);
    expect(round.summary).toBe('Some improvements');
    expect(round.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

// ── isReviewLoopExhausted ──

describe('isReviewLoopExhausted', () => {
  it('returns false when under limit', () => {
    const state = buildReviewLoopState('t', 'T', 1, 3, []);
    expect(isReviewLoopExhausted(state)).toBe(false);
  });

  it('returns true when at max rounds', () => {
    const state = buildReviewLoopState('t', 'T', 3, 3, []);
    expect(isReviewLoopExhausted(state)).toBe(true);
  });

  it('returns true when exceeding max rounds', () => {
    const state = buildReviewLoopState('t', 'T', 4, 3, []);
    expect(isReviewLoopExhausted(state)).toBe(true);
  });
});

// ── countBlockingViolations ──

describe('countBlockingViolations', () => {
  it('counts critical and high violations', () => {
    const violations: ReviewViolation[] = [
      { severity: 'critical', message: 'a' },
      { severity: 'high', message: 'b' },
      { severity: 'medium', message: 'c' },
      { severity: 'low', message: 'd' },
    ];
    expect(countBlockingViolations(violations)).toBe(2);
  });

  it('returns 0 when no blocking violations', () => {
    const violations: ReviewViolation[] = [
      { severity: 'medium', message: 'a' },
      { severity: 'low', message: 'b' },
    ];
    expect(countBlockingViolations(violations)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(countBlockingViolations([])).toBe(0);
  });
});

// ── formatRepairBrief ──

describe('formatRepairBrief', () => {
  const violations: ReviewViolation[] = [
    { severity: 'critical', message: 'SQL injection risk', file: 'src/db.ts', line: 15, suggestion: 'Use parameterised queries' },
    { severity: 'high', message: 'Missing auth check', file: 'src/api.ts' },
    { severity: 'medium', message: 'Magic number', suggestion: 'Extract to constant' },
    { severity: 'low', message: 'Naming convention' },
  ];

  it('includes round info', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('Review Round 1/3');
    expect(brief).toContain('task-1');
  });

  it('groups violations by severity', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('CRITICAL (1)');
    expect(brief).toContain('HIGH (1)');
    expect(brief).toContain('MEDIUM (1)');
    expect(brief).toContain('LOW (1)');
  });

  it('includes file and line references', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('`src/db.ts:15`');
    expect(brief).toContain('`src/api.ts`');
  });

  it('includes fix suggestions', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('Use parameterised queries');
    expect(brief).toContain('Extract to constant');
  });

  it('shows severity count summary', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('🔴 1 critical');
    expect(brief).toContain('🟠 1 high');
  });

  it('shows trend when previous rounds exist', () => {
    const prevRound = buildReviewRound(1, [
      { severity: 'high', message: 'a' },
      { severity: 'high', message: 'b' },
      { severity: 'high', message: 'c' },
      { severity: 'high', message: 'd' },
      { severity: 'high', message: 'e' },
    ]);
    const state = buildReviewLoopState('task-1', 'Auth feature', 2, 3, [prevRound, buildReviewRound(2, violations)]);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('fewer');
  });

  it('shows upward trend when violations increased', () => {
    const prevRound = buildReviewRound(1, [{ severity: 'low', message: 'x' }]);
    const state = buildReviewLoopState('task-1', 'Auth feature', 2, 3, [prevRound, buildReviewRound(2, violations)]);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('more');
  });

  it('includes action required instructions', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 1, 3, []);
    const brief = formatRepairBrief(state, violations);
    expect(brief).toContain('Action Required');
    expect(brief).toContain('critical');
    expect(brief).toContain('high');
  });
});

// ── formatEscalationMessage ──

describe('formatEscalationMessage', () => {
  it('indicates escalation is required', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 3, 3, []);
    const msg = formatEscalationMessage(state);
    expect(msg).toContain('Escalation Required');
    expect(msg).toContain('3/3');
  });

  it('shows round history progression', () => {
    const rounds = [
      buildReviewRound(1, [
        { severity: 'critical', message: 'a' },
        { severity: 'high', message: 'b' },
      ]),
      buildReviewRound(2, [
        { severity: 'high', message: 'b' },
      ]),
      buildReviewRound(3, [
        { severity: 'medium', message: 'c' },
      ]),
    ];
    const state = buildReviewLoopState('task-1', 'Auth feature', 3, 3, rounds);
    const msg = formatEscalationMessage(state);
    expect(msg).toContain('Round 1: 2 findings (2 critical/high)');
    expect(msg).toContain('Round 2: 1 findings (1 critical/high)');
    expect(msg).toContain('Round 3: 1 findings (0 critical/high)');
  });

  it('suggests remediation actions', () => {
    const state = buildReviewLoopState('task-1', 'Auth feature', 3, 3, []);
    const msg = formatEscalationMessage(state);
    expect(msg).toContain('Pairing session');
    expect(msg).toContain('smaller');
    expect(msg).toContain('Reassigning');
  });
});
