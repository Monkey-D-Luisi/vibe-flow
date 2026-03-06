import { describe, it, expect } from 'vitest';
import { injectCallerIntoPipelineAdvance } from '../../src/hooks/pipeline-caller-injection.js';

describe('injectCallerIntoPipelineAdvance', () => {
  const ctx = { agentId: 'back-1', sessionKey: 'agent:back-1:main' };

  it('injects _callerAgentId for pipeline_advance tool calls', () => {
    const event = {
      toolName: 'pipeline_advance',
      params: { taskId: 'TASK-001' },
    };
    const result = injectCallerIntoPipelineAdvance(event, ctx);
    expect(result).toEqual({
      params: {
        taskId: 'TASK-001',
        _callerAgentId: 'back-1',
      },
    });
  });

  it('does not inject for non-pipeline_advance tools', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', body: 'Hello' },
    };
    expect(injectCallerIntoPipelineAdvance(event, ctx)).toBeUndefined();
  });

  it('overrides LLM-provided _callerAgentId with session context', () => {
    const event = {
      toolName: 'pipeline_advance',
      params: { taskId: 'TASK-001', _callerAgentId: 'fake-agent' },
    };
    const result = injectCallerIntoPipelineAdvance(event, ctx);
    expect(result?.params._callerAgentId).toBe('back-1');
  });

  it('does not inject when agentId is undefined in context', () => {
    const event = {
      toolName: 'pipeline_advance',
      params: { taskId: 'TASK-001' },
    };
    expect(injectCallerIntoPipelineAdvance(event, {})).toBeUndefined();
  });

  it('preserves all existing params when injecting', () => {
    const event = {
      toolName: 'pipeline_advance',
      params: { taskId: 'TASK-001', skipDesign: true },
    };
    const result = injectCallerIntoPipelineAdvance(event, ctx);
    expect(result?.params).toMatchObject({
      taskId: 'TASK-001',
      skipDesign: true,
      _callerAgentId: 'back-1',
    });
  });
});
