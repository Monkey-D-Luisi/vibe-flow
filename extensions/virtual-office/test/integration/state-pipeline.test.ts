/**
 * Integration test: State pipeline.
 *
 * Verifies the full flow: hook event → event-mapper → state store → expected state.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentStateStore } from '../../src/state/agent-state-store.js';
import { createEventHandlers } from '../../src/state/event-mapper.js';
import { getStageLocation } from '../../src/shared/stage-location-map.js';
import { getToolAction } from '../../src/shared/tool-action-map.js';

describe('state pipeline integration', () => {
  let store: AgentStateStore;
  let handlers: ReturnType<typeof createEventHandlers>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new AgentStateStore();
    handlers = createEventHandlers(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    store.removeAllListeners();
  });

  it('tool call sets agent active with correct tool and FSM mapping', () => {
    handlers.onBeforeToolCall(
      { toolName: 'quality_tests', params: { taskId: 'T-001' } },
      { agentId: 'qa' },
    );

    const state = store.get('qa');
    expect(state?.status).toBe('active');
    expect(state?.currentTool).toBe('quality_tests');
    expect(state?.taskId).toBe('T-001');

    // Verify tool maps to typing animation
    const fsmState = getToolAction(state!.currentTool);
    expect(fsmState).toBe('typing');
  });

  it('pipeline advance updates stage and maps to correct location', () => {
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { targetStage: 'DESIGN', taskId: 'T-002' } },
      { agentId: 'designer' },
    );

    const state = store.get('designer');
    expect(state?.pipelineStage).toBe('DESIGN');

    // Verify location mapping
    const loc = getStageLocation('DESIGN', 12, 2);
    expect(loc.col).toBe(12);
    expect(loc.row).toBe(3);
    expect(loc.activity).toBe('reading');
  });

  it('agent end returns to idle and clears pipeline context', () => {
    // First make agent active
    handlers.onBeforeToolCall(
      { toolName: 'task_search' },
      { agentId: 'pm' },
    );
    expect(store.get('pm')?.status).toBe('active');

    // Then agent_end
    handlers.onAgentEnd({}, { agentId: 'pm' });
    const state = store.get('pm');
    expect(state?.status).toBe('idle');
    expect(state?.currentTool).toBeNull();
    expect(state?.taskId).toBeNull();
    expect(state?.pipelineStage).toBeNull();
  });

  it('subagent spawn transitions spawning → active', () => {
    handlers.onSubagentSpawned({ agentId: 'back-1' });
    expect(store.get('back-1')?.status).toBe('spawning');

    vi.advanceTimersByTime(2000);
    expect(store.get('back-1')?.status).toBe('active');
  });

  it('full lifecycle: idle → active → tool call → pipeline advance → idle', () => {
    const changes: string[] = [];
    store.on('change', (event: { agentId: string; state: { status: string } }) => {
      changes.push(`${event.agentId}:${event.state.status}`);
    });

    // Agent starts idle
    expect(store.get('front-1')?.status).toBe('idle');

    // Tool call
    handlers.onBeforeToolCall(
      { toolName: 'task_create', params: { taskId: 'T-003' } },
      { agentId: 'front-1' },
    );

    // Pipeline advance
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { targetStage: 'IMPLEMENTATION', taskId: 'T-003' } },
      { agentId: 'front-1' },
    );

    // After tool call
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { currentStage: 'IMPLEMENTATION' } },
      { agentId: 'front-1' },
    );

    // Agent end
    handlers.onAgentEnd({}, { agentId: 'front-1' });

    const state = store.get('front-1');
    expect(state?.status).toBe('idle');
    expect(state?.pipelineStage).toBeNull();
    expect(state?.taskId).toBeNull();

    // Verify at least 4 change events fired
    expect(changes.length).toBeGreaterThanOrEqual(4);
  });

  it('meeting stages map to meeting room in the office', () => {
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { targetStage: 'REFINEMENT' } },
      { agentId: 'po' },
    );

    const state = store.get('po');
    expect(state?.pipelineStage).toBe('REFINEMENT');

    const loc = getStageLocation('REFINEMENT', 9, 2);
    expect(loc.activity).toBe('meeting');
    expect(loc.col).toBe(10);
    expect(loc.row).toBe(3);
  });
});
