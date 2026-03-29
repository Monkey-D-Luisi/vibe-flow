import { describe, it, expect } from 'vitest';
import {
  parseIntent,
  intentToCommand,
  formatIntentHelp,
  type ParsedIntent,
} from '../../src/intents/intent-parser.js';

describe('parseIntent', () => {
  // ── Status intents ──
  it('recognises "how is the team"', () => {
    const intent = parseIntent("how's the team doing?");
    expect(intent.kind).toBe('status');
    expect(intent.confidence).toBeGreaterThan(0.3);
  });

  it('recognises "team status"', () => {
    const intent = parseIntent('team status');
    expect(intent.kind).toBe('status');
  });

  it('recognises "what is going on"', () => {
    const intent = parseIntent("what's going on?");
    expect(intent.kind).toBe('status');
  });

  it('recognises "sitrep"', () => {
    const intent = parseIntent('sitrep');
    expect(intent.kind).toBe('status');
  });

  it('recognises "who is working"', () => {
    const intent = parseIntent("who's working right now?");
    expect(intent.kind).toBe('status');
  });

  // ── Pipeline intents ──
  it('recognises "show me the pipeline"', () => {
    const intent = parseIntent('show me the pipeline');
    expect(intent.kind).toBe('pipeline');
  });

  it('recognises "where is task-0123"', () => {
    const intent = parseIntent('where is task-0123?');
    expect(intent.kind).toBe('pipeline');
  });

  it('recognises "pipeline task-0042" with args', () => {
    const intent = parseIntent('pipeline task-0042');
    expect(intent.kind).toBe('pipeline');
    expect(intent.args).toBe('task-0042');
  });

  it('recognises "show me the progress"', () => {
    const intent = parseIntent('show me the progress');
    expect(intent.kind).toBe('pipeline');
  });

  // ── Budget intents ──
  it('recognises "how much have we spent"', () => {
    const intent = parseIntent('how much have we spent?');
    expect(intent.kind).toBe('budget');
  });

  it('recognises "remaining budget"', () => {
    const intent = parseIntent('remaining budget');
    expect(intent.kind).toBe('budget');
  });

  it('recognises "token usage"', () => {
    const intent = parseIntent('token usage');
    expect(intent.kind).toBe('budget');
  });

  // ── Health intents ──
  it('recognises "is everything ok"', () => {
    const intent = parseIntent('is everything ok?');
    expect(intent.kind).toBe('health');
  });

  it('recognises "system check"', () => {
    const intent = parseIntent('system check');
    expect(intent.kind).toBe('health');
  });

  it('recognises "diagnostics"', () => {
    const intent = parseIntent('diagnostics');
    expect(intent.kind).toBe('health');
  });

  // ── Decision intents ──
  it('recognises "approve decision abc option1"', () => {
    const intent = parseIntent('approve decision abc option1');
    expect(intent.kind).toBe('approve_decision');
    expect(intent.args).toBe('abc');
  });

  it('recognises "reject decision xyz bad idea"', () => {
    const intent = parseIntent('reject decision xyz bad idea');
    expect(intent.kind).toBe('reject_decision');
    expect(intent.args).toBe('xyz');
  });

  it('recognises "lgtm" as approval', () => {
    const intent = parseIntent('lgtm');
    expect(intent.kind).toBe('approve_decision');
  });

  // ── Idea intents ──
  it('recognises "build a login page"', () => {
    const intent = parseIntent('build a login page');
    expect(intent.kind).toBe('idea');
    expect(intent.args).toBe('login page');
  });

  it('recognises "we should add dark mode"', () => {
    const intent = parseIntent('we should add dark mode');
    expect(intent.kind).toBe('idea');
  });

  it('recognises "what if we added a search bar"', () => {
    const intent = parseIntent('what if we added a search bar');
    expect(intent.kind).toBe('idea');
  });

  // ── Help intents ──
  it('recognises "help"', () => {
    const intent = parseIntent('help');
    expect(intent.kind).toBe('help');
  });

  it('recognises "what can you do"', () => {
    const intent = parseIntent('what can you do?');
    expect(intent.kind).toBe('help');
  });

  // ── Unknown ──
  it('returns unknown for unrecognised text', () => {
    const intent = parseIntent('the weather is nice today');
    expect(intent.kind).toBe('unknown');
    expect(intent.confidence).toBe(0);
  });

  it('returns unknown for empty string', () => {
    const intent = parseIntent('');
    expect(intent.kind).toBe('unknown');
    expect(intent.confidence).toBe(0);
  });

  it('preserves raw message', () => {
    const intent = parseIntent('show pipeline');
    expect(intent.raw).toBe('show pipeline');
  });

  // ── Confidence scoring ──
  it('gives higher confidence for shorter, more specific messages', () => {
    const short = parseIntent('team status');
    const long = parseIntent('hey can you tell me the team status please and also send me a coffee');
    expect(short.confidence).toBeGreaterThan(long.confidence);
  });
});

// ── intentToCommand ──

describe('intentToCommand', () => {
  it('maps status to teamstatus command', () => {
    const cmd = intentToCommand({ kind: 'status', confidence: 0.8, raw: 'sitrep' });
    expect(cmd).toEqual({ command: 'teamstatus' });
  });

  it('maps pipeline to pipeline command with args', () => {
    const cmd = intentToCommand({ kind: 'pipeline', confidence: 0.8, args: 'task-01', raw: 'pipeline task-01' });
    expect(cmd).toEqual({ command: 'pipeline', args: 'task-01' });
  });

  it('maps budget to budget command', () => {
    const cmd = intentToCommand({ kind: 'budget', confidence: 0.8, raw: 'budget' });
    expect(cmd).toEqual({ command: 'budget' });
  });

  it('maps health to health command', () => {
    const cmd = intentToCommand({ kind: 'health', confidence: 0.8, raw: 'health' });
    expect(cmd).toEqual({ command: 'health' });
  });

  it('maps help to help command', () => {
    const cmd = intentToCommand({ kind: 'help', confidence: 0.8, raw: 'help' });
    expect(cmd).toEqual({ command: 'help' });
  });

  it('maps approve_decision with args', () => {
    const cmd = intentToCommand({ kind: 'approve_decision', confidence: 0.8, args: 'dec-1 option-a', raw: 'approve dec-1 option-a' });
    expect(cmd).toEqual({ command: 'approve', args: 'dec-1 option-a' });
  });

  it('returns null for approve_decision without args', () => {
    const cmd = intentToCommand({ kind: 'approve_decision', confidence: 0.5, raw: 'lgtm' });
    expect(cmd).toBeNull();
  });

  it('maps reject_decision with args', () => {
    const cmd = intentToCommand({ kind: 'reject_decision', confidence: 0.8, args: 'dec-1 not ready', raw: 'reject dec-1 not ready' });
    expect(cmd).toEqual({ command: 'reject', args: 'dec-1 not ready' });
  });

  it('maps idea with args', () => {
    const cmd = intentToCommand({ kind: 'idea', confidence: 0.8, args: 'login page', raw: 'build a login page' });
    expect(cmd).toEqual({ command: 'idea', args: 'login page' });
  });

  it('returns null for unknown intent', () => {
    const cmd = intentToCommand({ kind: 'unknown', confidence: 0, raw: 'hello' });
    expect(cmd).toBeNull();
  });
});

// ── formatIntentHelp ──

describe('formatIntentHelp', () => {
  it('returns a message with natural language examples', () => {
    const help = formatIntentHelp();
    expect(help).toContain('natural language');
    expect(help).toContain('teamstatus');
    expect(help).toContain('pipeline');
  });
});
