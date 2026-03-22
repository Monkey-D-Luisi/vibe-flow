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
      { toolName: 'pipeline_advance', params: { taskId: 'T-002' } },
      { agentId: 'designer' },
    );

    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'DESIGN', taskId: 'T-002' } } },
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

  it('agent end returns to idle and clears currentTool but keeps task context', () => {
    // First make agent active with task context
    handlers.onBeforeToolCall(
      { toolName: 'task_search', params: { taskId: 'T-010' } },
      { agentId: 'pm' },
    );
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'REFINEMENT', taskId: 'T-010' } } },
      { agentId: 'pm' },
    );
    expect(store.get('pm')?.status).toBe('active');

    // Then agent_end -- only status and currentTool are cleared
    handlers.onAgentEnd({}, { agentId: 'pm' });
    const state = store.get('pm');
    expect(state?.status).toBe('idle');
    expect(state?.currentTool).toBeNull();
    // taskId and pipelineStage persist so pipeline panel can show grace-period data
    expect(state?.taskId).toBe('T-010');
    expect(state?.pipelineStage).toBe('REFINEMENT');
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
      { toolName: 'pipeline_advance', params: { taskId: 'T-003' } },
      { agentId: 'front-1' },
    );

    // After tool call
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'IMPLEMENTATION', taskId: 'T-003' } } },
      { agentId: 'front-1' },
    );

    // Agent end
    handlers.onAgentEnd({}, { agentId: 'front-1' });

    const state = store.get('front-1');
    expect(state?.status).toBe('idle');
    // task context persists after agent_end (grace-period display in pipeline panel)
    expect(state?.pipelineStage).toBe('IMPLEMENTATION');
    expect(state?.taskId).toBe('T-003');

    // Verify at least 4 change events fired
    expect(changes.length).toBeGreaterThanOrEqual(4);
  });

  it('full pipeline lifecycle: pipeline_start through advance shows continuous activity', () => {
    // Step 1: PM starts a pipeline
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_start', params: {} },
      { agentId: 'pm' },
    );
    handlers.onAfterToolCall(
      { toolName: 'pipeline_start', result: { details: { taskId: 'T-100', status: 'IDEA', title: 'New feature' } } },
      { agentId: 'pm' },
    );

    // PM should have pipeline context immediately after pipeline_start
    expect(store.get('pm')?.pipelineStage).toBe('IDEA');
    expect(store.get('pm')?.taskId).toBe('T-100');

    // Step 2: PM advances pipeline to ROADMAP
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { taskId: 'T-100' } },
      { agentId: 'pm' },
    );
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'ROADMAP', taskId: 'T-100', previousStage: 'IDEA' } } },
      { agentId: 'pm' },
    );

    expect(store.get('pm')?.pipelineStage).toBe('ROADMAP');

    // Step 3: PM advances to REFINEMENT -- PO is the owner
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'REFINEMENT', taskId: 'T-100', previousStage: 'ROADMAP' } } },
      { agentId: 'pm' },
    );

    // PM gets the new stage and PO (stage owner) also gets it via propagation
    expect(store.get('pm')?.pipelineStage).toBe('REFINEMENT');
    expect(store.get('po')?.pipelineStage).toBe('REFINEMENT');
    expect(store.get('po')?.taskId).toBe('T-100');

    // Step 4: PO is spawned as subagent
    handlers.onSubagentSpawned({ agentId: 'po' });
    expect(store.get('po')?.pipelineStage).toBe('REFINEMENT');
    expect(store.get('po')?.taskId).toBe('T-100');

    // Step 5: PO does work (tool calls without pipeline tools)
    handlers.onBeforeToolCall(
      { toolName: 'task_update', params: { taskId: 'T-100' } },
      { agentId: 'po' },
    );
    handlers.onAfterToolCall(
      { toolName: 'task_update', result: { updated: true } },
      { agentId: 'po' },
    );

    // PO still has pipeline context even after non-pipeline tool calls
    expect(store.get('po')?.pipelineStage).toBe('REFINEMENT');
    expect(store.get('po')?.taskId).toBe('T-100');

    // Step 6: PO ends - context persists for grace period
    handlers.onAgentEnd({}, { agentId: 'po' });
    expect(store.get('po')?.pipelineStage).toBe('REFINEMENT');
    expect(store.get('po')?.taskId).toBe('T-100');
    expect(store.get('po')?.status).toBe('idle');
  });

  it('meeting stages map to meeting room in the office', () => {
    handlers.onBeforeToolCall(
      { toolName: 'pipeline_advance', params: { taskId: 'T-020' } },
      { agentId: 'po' },
    );

    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'REFINEMENT', taskId: 'T-020' } } },
      { agentId: 'po' },
    );

    const state = store.get('po');
    expect(state?.pipelineStage).toBe('REFINEMENT');

    const loc = getStageLocation('REFINEMENT', 9, 2);
    expect(loc.activity).toBe('meeting');
    expect(loc.col).toBe(10);
    expect(loc.row).toBe(4);
  });

  it('team-message workflow: agent inherits pipeline context via taskId match', () => {
    // Step 1: PM starts pipeline and advances to IMPLEMENTATION
    handlers.onAfterToolCall(
      { toolName: 'pipeline_start', result: { details: { taskId: 'T-TEAM', status: 'IDEA', title: 'Team test' } } },
      { agentId: 'pm' },
    );
    handlers.onAfterToolCall(
      { toolName: 'pipeline_advance', result: { details: { currentStage: 'IMPLEMENTATION', taskId: 'T-TEAM', previousStage: 'IDEA' } } },
      { agentId: 'pm' },
    );

    // back-1 gets context via propagation (stage owner)
    expect(store.get('back-1')?.pipelineStage).toBe('IMPLEMENTATION');

    // Step 2: QA picks up the same task via team_reply (not spawned)
    handlers.onBeforeToolCall(
      { toolName: 'task_update', params: { taskId: 'T-TEAM' } },
      { agentId: 'qa' },
    );

    // QA should inherit pipeline context from the taskId match
    expect(store.get('qa')?.pipelineStage).toBe('IMPLEMENTATION');
    expect(store.get('qa')?.taskId).toBe('T-TEAM');
  });
});
