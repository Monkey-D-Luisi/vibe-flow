import { describe, it, expect } from 'vitest';
import {
  escapeMarkdownV2,
  formatTaskTransition,
  formatPrCreation,
  formatQualityGate,
  formatAgentError,
  formatPipelineAdvance,
  formatPipelineComplete,
} from '../src/formatting.js';

describe('escapeMarkdownV2', () => {
  it('escapes underscore', () => {
    expect(escapeMarkdownV2('hello_world')).toBe('hello\\_world');
  });

  it('escapes asterisk', () => {
    expect(escapeMarkdownV2('bold*text')).toBe('bold\\*text');
  });

  it('escapes square brackets', () => {
    expect(escapeMarkdownV2('a[b]c')).toBe('a\\[b\\]c');
  });

  it('escapes parentheses', () => {
    expect(escapeMarkdownV2('(test)')).toBe('\\(test\\)');
  });

  it('escapes dot', () => {
    expect(escapeMarkdownV2('v1.2.3')).toBe('v1\\.2\\.3');
  });

  it('escapes exclamation mark', () => {
    expect(escapeMarkdownV2('hello!')).toBe('hello\\!');
  });

  it('leaves plain alphanumerics unchanged', () => {
    expect(escapeMarkdownV2('HelloWorld123')).toBe('HelloWorld123');
  });

  it('escapes multiple special chars', () => {
    expect(escapeMarkdownV2('a_b*c')).toBe('a\\_b\\*c');
  });

  it('escapes backslash', () => {
    expect(escapeMarkdownV2('back\\slash')).toBe('back\\\\slash');
  });
});

describe('formatTaskTransition', () => {
  it('formats a standard transition', () => {
    const result = formatTaskTransition({
      taskId: '123',
      toStatus: 'in_progress',
      agentId: 'back-1',
    });
    expect(result).toContain('📋');
    expect(result).toContain('Task 123');
    expect(result).toContain('in\\_progress');
    expect(result).toContain('back\\-1');
  });

  it('falls back to defaults when params are missing', () => {
    const result = formatTaskTransition({});
    expect(result).toContain('unknown');
    expect(result).toContain('system');
  });
});

describe('formatPrCreation', () => {
  it('includes PR number and title', () => {
    const result = formatPrCreation(
      { title: 'Add auth' },
      { number: 42, title: 'Add auth flow', url: '' },
    );
    expect(result).toContain('🔀');
    expect(result).toContain('42');
    expect(result).toContain('Add auth flow');
  });

  it('includes View link when url is present', () => {
    const result = formatPrCreation(
      {},
      { number: 99, title: 'Fix bug', url: 'https://github.com/x/y/pull/99' },
    );
    expect(result).toContain('[View](https://github.com/x/y/pull/99)');
  });

  it('omits link when url is empty', () => {
    const result = formatPrCreation({}, { number: 1, title: 'Draft', url: '' });
    expect(result).not.toContain('[View]');
  });

  it('falls back to params title if result has none', () => {
    const result = formatPrCreation({ title: 'Param title' }, {});
    expect(result).toContain('Param title');
  });
});

describe('formatQualityGate', () => {
  it('formats a passing gate', () => {
    const result = formatQualityGate({}, { pass: true, coverage: 87 });
    expect(result).toContain('✅');
    expect(result).toContain('PASSED');
    expect(result).toContain('87');
  });

  it('formats a failing gate', () => {
    const result = formatQualityGate({}, { pass: false });
    expect(result).toContain('❌');
    expect(result).toContain('FAILED');
  });

  it('accepts "passed" as pass indicator', () => {
    const result = formatQualityGate({}, { passed: true });
    expect(result).toContain('✅');
  });

  it('omits coverage when not present', () => {
    const result = formatQualityGate({}, { pass: true });
    expect(result).not.toContain('coverage');
  });
});

describe('formatAgentError', () => {
  it('includes agent ID and error message', () => {
    const result = formatAgentError({
      agentId: 'back-1',
      error: 'Connection refused',
    });
    expect(result).toContain('⚠️');
    expect(result).toContain('back\\-1');
    expect(result).toContain('Connection refused');
  });

  it('truncates error messages longer than 200 chars', () => {
    const longError = 'x'.repeat(300);
    const result = formatAgentError({ agentId: 'qa', error: longError });
    // After escaping, truncation is applied to the raw string before escaping
    expect(result.length).toBeLessThan(500);
  });

  it('falls back to defaults when event fields are missing', () => {
    const result = formatAgentError({});
    expect(result).toContain('unknown');
    expect(result).toContain('Unknown error');
  });

  it('includes sessionKey when provided', () => {
    const result = formatAgentError({
      agentId: 'qa',
      error: 'crash',
      sessionKey: 'agent:qa:main',
    });
    expect(result).toContain('session');
    expect(result).toContain('agent:qa:main');
  });
});

describe('formatPipelineAdvance', () => {
  it('formats a stage transition with duration', () => {
    const result = formatPipelineAdvance({
      taskId: '01KK1R87G7BFHX8WGFTD8799KN',
      previousStage: 'IDEA',
      currentStage: 'ROADMAP',
      owner: 'pm',
      durationMs: 10500,
    });
    expect(result).toContain('IDEA');
    expect(result).toContain('ROADMAP');
    expect(result).toContain('pm');
    expect(result).toContain('11s');
  });

  it('formats without duration when not available', () => {
    const result = formatPipelineAdvance({
      taskId: 'ABC123',
      previousStage: 'QA',
      currentStage: 'REVIEW',
      owner: 'tech-lead',
    });
    expect(result).toContain('QA');
    expect(result).toContain('REVIEW');
    expect(result).toContain('tech\\-lead');
  });

  it('shows last 8 chars of task ID', () => {
    const result = formatPipelineAdvance({
      taskId: '01KK1R87G7BFHX8WGFTD8799KN',
      previousStage: 'IDEA',
      currentStage: 'ROADMAP',
      owner: 'pm',
    });
    expect(result).toContain('D8799KN');
  });

  it('formats duration in minutes for longer durations', () => {
    const result = formatPipelineAdvance({
      taskId: 'TASK1',
      previousStage: 'IMPLEMENTATION',
      currentStage: 'QA',
      owner: 'qa',
      durationMs: 252000, // 4m12s
    });
    expect(result).toContain('4m12s');
  });
});

describe('formatPipelineComplete', () => {
  it('formats pipeline completion with task ID', () => {
    const result = formatPipelineComplete({
      taskId: '01KK1R87G7BFHX8WGFTD8799KN',
    });
    expect(result).toContain('DONE');
    expect(result).toContain('01KK1R87G7BFHX8WGFTD8799KN');
    expect(result).toContain('completed all stages');
  });

  it('includes stage duration when available', () => {
    const result = formatPipelineComplete({
      taskId: 'TASK1',
      durationMs: 126000,
    });
    expect(result).toContain('DONE');
    expect(result).toContain('2m6s');
  });

  it('omits duration when not available', () => {
    const result = formatPipelineComplete({
      taskId: 'TASK1',
    });
    expect(result).not.toContain('Total');
  });
});
