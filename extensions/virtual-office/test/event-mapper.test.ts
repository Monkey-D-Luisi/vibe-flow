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
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'IMPLEMENTATION', taskId: 'TASK-101' } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('pm')?.taskId).toBe('TASK-101');
  });

  it('onAgentEnd sets agent to idle and clears currentTool but keeps task context', () => {
    const store = new AgentStateStore(['back-1']);
    const handlers = createEventHandlers(store);

    // First set to active
    store.update('back-1', {
      status: 'active',
      currentTool: 'vcs_pr_create',
      taskId: 'TASK-99',
      pipelineStage: 'REVIEW',
    });

    handlers.onAgentEnd({}, { agentId: 'back-1' });

    const state = store.get('back-1');
    expect(state?.status).toBe('idle');
    expect(state?.currentTool).toBeNull();
    // taskId and pipelineStage are kept as last-known context for the pipeline panel
    expect(state?.taskId).toBe('TASK-99');
    expect(state?.pipelineStage).toBe('REVIEW');
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

  // --- Pipeline extractor regression tests ---

  it('onAfterToolCall extracts stage IDEA and taskId from pipeline_start result', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_start', result: { details: { taskId: 'T-001', status: 'IDEA', title: 'Test idea' } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('IDEA');
    expect(store.get('pm')?.taskId).toBe('T-001');
  });

  it('onAfterToolCall extracts stage from pipeline_skip result', () => {
    const store = new AgentStateStore(['tech-lead']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_skip', result: { details: { skipped: true, taskId: 'T-002', skippedStage: 'DESIGN', nextStage: 'IMPLEMENTATION' } } },
      { agentId: 'tech-lead' },
    );

    expect(store.get('tech-lead')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('tech-lead')?.taskId).toBe('T-002');
  });

  it('onAfterToolCall extracts stage from pipeline_retry result', () => {
    const store = new AgentStateStore(['qa']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_retry', result: { details: { retried: true, taskId: 'T-003', stage: 'QA', previousStage: 'REVIEW' } } },
      { agentId: 'qa' },
    );

    expect(store.get('qa')?.pipelineStage).toBe('QA');
    expect(store.get('qa')?.taskId).toBe('T-003');
  });

  it('onAfterToolCall extracts stage from pipeline_timeline result', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_timeline', result: { details: { taskId: 'T-004', currentStage: 'REVIEW', stages: [] } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('REVIEW');
    expect(store.get('pm')?.taskId).toBe('T-004');
  });

  it('onAfterToolCall extracts stage from pipeline_status with single task', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_status', result: { details: { tasks: [{ id: 'T-005', stage: 'IMPLEMENTATION', owner: 'back-1' }] } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('pm')?.taskId).toBe('T-005');
  });

  it('onAfterToolCall does NOT set stage from pipeline_status with multiple tasks', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_status', result: { details: { tasks: [
        { id: 'T-010', stage: 'QA', owner: 'qa' },
        { id: 'T-011', stage: 'DESIGN', owner: 'designer' },
      ] } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBeNull();
  });

  it('onAfterToolCall does NOT set stage from pipeline_metrics', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_metrics', result: { details: { stages: [], taskCount: 5 } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBeNull();
  });

  it('pipeline_advance propagates stage to the stage owner', () => {
    const store = new AgentStateStore(['pm', 'back-1']);
    const handlers = createEventHandlers(store);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'IMPLEMENTATION', taskId: 'T-050' } } },
      { agentId: 'pm' },
    );

    // PM gets the stage (caller)
    expect(store.get('pm')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('pm')?.taskId).toBe('T-050');
    // back-1 also gets the stage (stage owner)
    expect(store.get('back-1')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('back-1')?.taskId).toBe('T-050');
  });

  it('onBeforeToolCall does NOT set pipelineStage from pipeline_advance params', () => {
    const store = new AgentStateStore(['pm']);
    const handlers = createEventHandlers(store);

    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { taskId: 'T-060' } },
      { agentId: 'pm' },
    );

    // taskId is extracted from params, but pipelineStage should NOT be set
    expect(store.get('pm')?.taskId).toBe('T-060');
    expect(store.get('pm')?.pipelineStage).toBeNull();
  });

  it('onSubagentSpawned inherits pipeline context from most recent active agent', () => {
    vi.useFakeTimers();
    const store = new AgentStateStore(['pm', 'designer']);
    const handlers = createEventHandlers(store);

    // Set PM with pipeline context
    store.update('pm', { taskId: 'T-070', pipelineStage: 'DESIGN', status: 'active' });

    handlers.onSubagentSpawned({ agentId: 'designer' });

    expect(store.get('designer')?.status).toBe('spawning');
    expect(store.get('designer')?.taskId).toBe('T-070');
    expect(store.get('designer')?.pipelineStage).toBe('DESIGN');

    vi.advanceTimersByTime(2000);
    expect(store.get('designer')?.status).toBe('active');
    vi.useRealTimers();
  });

  // --- TaskId-based pipeline context inference ---

  it('onBeforeToolCall inherits pipeline context from agent with matching taskId', () => {
    const store = new AgentStateStore(['pm', 'back-1']);
    const handlers = createEventHandlers(store);

    // PM has pipeline context for T-100
    store.update('pm', { taskId: 'T-100', pipelineStage: 'IMPLEMENTATION', status: 'active' });

    // back-1 calls a tool with the same taskId (via team_reply workflow)
    handlers.onBeforeToolCall(
      { toolName: 'task_update', params: { taskId: 'T-100' } },
      { agentId: 'back-1' },
    );

    expect(store.get('back-1')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('back-1')?.taskId).toBe('T-100');
  });

  it('onBeforeToolCall does NOT overwrite existing pipelineStage via inference', () => {
    const store = new AgentStateStore(['pm', 'back-1']);
    const handlers = createEventHandlers(store);

    // PM has a different pipeline context
    store.update('pm', { taskId: 'T-100', pipelineStage: 'IMPLEMENTATION', status: 'active' });
    // back-1 already has pipeline context from a different stage
    store.update('back-1', { taskId: 'T-200', pipelineStage: 'QA', status: 'active' });

    // back-1 calls a tool referencing T-100
    handlers.onBeforeToolCall(
      { toolName: 'task_update', params: { taskId: 'T-100' } },
      { agentId: 'back-1' },
    );

    // Should NOT overwrite -- back-1 already has pipelineStage
    expect(store.get('back-1')?.pipelineStage).toBe('QA');
  });

  it('onBeforeToolCall does NOT infer pipeline when no matching donor exists', () => {
    const store = new AgentStateStore(['pm', 'back-1']);
    const handlers = createEventHandlers(store);

    // PM has pipeline context for a DIFFERENT taskId
    store.update('pm', { taskId: 'T-200', pipelineStage: 'DESIGN', status: 'active' });

    handlers.onBeforeToolCall(
      { toolName: 'task_update', params: { taskId: 'T-999' } },
      { agentId: 'back-1' },
    );

    expect(store.get('back-1')?.pipelineStage).toBeNull();
  });

  // --- Logger tests ---

  it('logger.info is called when pipeline context is set via extractor', () => {
    const store = new AgentStateStore(['pm']);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const handlers = createEventHandlers(store, logger);

    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'DESIGN', taskId: 'T-LOG' } } },
      { agentId: 'pm' },
    );

    expect(logger.info).toHaveBeenCalledWith('pipeline.context.set', expect.objectContaining({
      agentId: 'pm', stage: 'DESIGN', tool: 'pipeline_advance',
    }));
  });
});
