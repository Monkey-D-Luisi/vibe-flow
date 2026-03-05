import { describe, it, expect } from 'vitest';
import { injectAgentIdIntoDecisionEvaluate } from '../../src/hooks/agent-id-injection.js';

describe('injectAgentIdIntoDecisionEvaluate', () => {
  const ctx = { agentId: 'back-1', sessionKey: 'agent:back-1:main' };

  it('injects agentId for decision_evaluate tool calls', () => {
    const event = {
      toolName: 'decision_evaluate',
      params: { category: 'technical', question: 'Which lib?', options: [] },
    };
    const result = injectAgentIdIntoDecisionEvaluate(event, ctx);
    expect(result).toEqual({
      params: {
        category: 'technical',
        question: 'Which lib?',
        options: [],
        agentId: 'back-1',
      },
    });
  });

  it('does not inject for non-decision_evaluate tools', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', body: 'Hello' },
    };
    expect(injectAgentIdIntoDecisionEvaluate(event, ctx)).toBeUndefined();
  });

  it('overrides LLM-provided agentId with session context', () => {
    const event = {
      toolName: 'decision_evaluate',
      params: { category: 'technical', question: 'Q?', options: [], agentId: 'wrong-agent' },
    };
    const result = injectAgentIdIntoDecisionEvaluate(event, ctx);
    expect(result?.params.agentId).toBe('back-1');
  });

  it('does not inject when agentId is undefined in context', () => {
    const event = {
      toolName: 'decision_evaluate',
      params: { category: 'technical', question: 'Q?', options: [] },
    };
    expect(injectAgentIdIntoDecisionEvaluate(event, {})).toBeUndefined();
  });

  it('preserves all existing params when injecting', () => {
    const event = {
      toolName: 'decision_evaluate',
      params: { category: 'scope', question: 'Scope Q?', options: [{ id: 'a' }], taskRef: 'TASK-001', recommendation: 'a' },
    };
    const result = injectAgentIdIntoDecisionEvaluate(event, ctx);
    expect(result?.params).toMatchObject({
      category: 'scope',
      question: 'Scope Q?',
      options: [{ id: 'a' }],
      taskRef: 'TASK-001',
      recommendation: 'a',
      agentId: 'back-1',
    });
  });
});
