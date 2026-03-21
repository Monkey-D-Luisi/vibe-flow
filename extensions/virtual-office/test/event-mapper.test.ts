import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEventHandlers } from '../src/state/event-mapper.js';
import { AgentStateStore } from '../src/state/agent-state-store.js';

describe('Event Mapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('onBeforeToolCall sets agent to active with tool name', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onBeforeToolCall(
      { toolName: 'quality_tests' },
      { agentId: 'pm' },
    );

    const state = store.get('pm');
    expect(state?.status).toBe('active');
    expect(state?.currentTool).toBe('quality_tests');
  });

  it('onBeforeToolCall ignores events without agentId', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);
    const listener = vi.fn();
    store.on('change', listener);

    handlers.onBeforeToolCall({ toolName: 'quality_tests' }, {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('onBeforeToolCall extracts taskId from params', () => {
    const store = new AgentStateStore(['qa']);
    const handlers = createEventHandlers(store);

    handlers.onBeforeToolCall(
      { toolName: 'task_get', params: { taskId: 'TASK-42' } },
      { agentId: 'qa' },
    );

    expect(store.get('qa')?.taskId).toBe('TASK-42');
  });

  it('onAfterToolCall keeps agent active but clears currentTool', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'quality_tests', result: { passed: true } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.status).toBe('active');
    expect(store.get('pm')?.currentTool).toBeNull();
  });

  it('onAfterToolCall extracts pipeline stage from pipeline_advance result', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { currentStage: 'IMPLEMENTATION' } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('IMPLEMENTATION');
  });

  it('onAgentEnd sets agent to idle and clears tool', () => {
    const store = new AgentStateStore(['back-1']);
    const handlers = createEventHandlers(store);

    // First set to active
    store.update('back-1', { status: 'active', currentTool: 'vcs_pr_create' });

    handlers.onAgentEnd({}, { agentId: 'back-1' });

    const state = store.get('back-1');
    expect(state?.status).toBe('idle');
    expect(state?.currentTool).toBeNull();
  });

  it('onBeforeToolCall increments toolCallSeq on each call', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onBeforeToolCall({ toolName: 'team_message' }, { agentId: 'pm' });
    expect(store.get('pm')?.toolCallSeq).toBe(1);

    handlers.onBeforeToolCall({ toolName: 'team_message' }, { agentId: 'pm' });
    expect(store.get('pm')?.toolCallSeq).toBe(2);

    handlers.onBeforeToolCall({ toolName: 'task_search' }, { agentId: 'pm' });
    expect(store.get('pm')?.toolCallSeq).toBe(3);
  });

  it('onAfterToolCall clears currentTool to null', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onBeforeToolCall({ toolName: 'quality_tests' }, { agentId: 'pm' });
    expect(store.get('pm')?.currentTool).toBe('quality_tests');

    handlers.onAfterToolCall(
      { toolName: 'quality_tests', result: { passed: true } },
      { agentId: 'pm' },
    );
    expect(store.get('pm')?.currentTool).toBeNull();
  });

  it('consecutive same-tool calls produce different toolCallSeq values', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);
    const changes: Array<{ currentTool: string | null; toolCallSeq: number }> = [];
    store.on('change', (e: { state: { currentTool: string | null; toolCallSeq: number } }) => {
      changes.push({ currentTool: e.state.currentTool, toolCallSeq: e.state.toolCallSeq });
    });

    // Simulate: before(team_message) → after(team_message) → before(team_message) → after(team_message)
    handlers.onBeforeToolCall({ toolName: 'team_message' }, { agentId: 'pm' });
    handlers.onAfterToolCall({ toolName: 'team_message' }, { agentId: 'pm' });
    handlers.onBeforeToolCall({ toolName: 'team_message' }, { agentId: 'pm' });
    handlers.onAfterToolCall({ toolName: 'team_message' }, { agentId: 'pm' });

    // 4 change events: before(seq=1), after(null), before(seq=2), after(null)
    expect(changes).toHaveLength(4);
    expect(changes[0]).toEqual({ currentTool: 'team_message', toolCallSeq: 1 });
    expect(changes[1]).toEqual({ currentTool: null, toolCallSeq: 1 });
    expect(changes[2]).toEqual({ currentTool: 'team_message', toolCallSeq: 2 });
    expect(changes[3]).toEqual({ currentTool: null, toolCallSeq: 2 });
  });

  it('onSubagentSpawned sets agent to spawning', () => {
    vi.useFakeTimers();
    const store = new AgentStateStore(['designer']);
    const handlers = createEventHandlers(store);

    handlers.onSubagentSpawned({ agentId: 'designer' });

    expect(store.get('designer')?.status).toBe('spawning');

    // After 2s, should transition to active
    vi.advanceTimersByTime(2000);
    expect(store.get('designer')?.status).toBe('active');
    vi.useRealTimers();
  });
});
