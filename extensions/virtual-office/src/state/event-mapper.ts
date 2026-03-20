/**
 * Event Mapper -- Maps OpenClaw lifecycle hook events to agent state changes.
 *
 * Provides handler functions for before_tool_call, after_tool_call,
 * agent_end, and subagent_spawned hooks.
 */

import type { AgentStateStore } from './agent-state-store.js';

/** Minimal hook event shape (from OpenClaw SDK). */
export interface ToolCallEvent {
  readonly toolName: string;
  readonly params?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: unknown;
}

/** Minimal hook context shape (from OpenClaw SDK). */
export interface HookContext {
  readonly agentId?: string;
}

/** Minimal subagent spawned event shape. */
export interface SubagentSpawnedEvent {
  readonly agentId?: string;
}

/**
 * Create lifecycle hook handlers that update the agent state store.
 */
export function createEventHandlers(store: AgentStateStore) {
  return {
    /** Handle before_tool_call: agent becomes active. */
    onBeforeToolCall(event: ToolCallEvent, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;

      const partial: Record<string, unknown> = {
        status: 'active',
        currentTool: event.toolName,
      };

      // Extract pipeline stage from pipeline_advance params
      if (event.toolName === 'pipeline_advance' && event.params) {
        const stage = event.params['targetStage'];
        if (typeof stage === 'string') {
          partial['pipelineStage'] = stage;
        }
      }

      // Extract taskId from params
      if (event.params) {
        const taskId = event.params['taskId'] ?? event.params['task_id'];
        if (typeof taskId === 'string') {
          partial['taskId'] = taskId;
        }
      }

      store.update(agentId, partial);
    },

    /** Handle after_tool_call: record result, keep active. */
    onAfterToolCall(event: ToolCallEvent, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;

      store.update(agentId, {
        status: 'active',
        currentTool: event.toolName,
      });

      // Extract pipeline stage from pipeline_advance result
      if (event.toolName === 'pipeline_advance' && event.result) {
        const result = event.result as Record<string, unknown>;
        const stage = result['currentStage'];
        if (typeof stage === 'string') {
          store.update(agentId, { pipelineStage: stage });
        }
      }
    },

    /** Handle agent_end: agent returns to idle. */
    onAgentEnd(_event: unknown, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;

      store.update(agentId, {
        status: 'idle',
        currentTool: null,
      });
    },

    /** Handle subagent_spawned: agent is spawning. */
    onSubagentSpawned(event: SubagentSpawnedEvent): void {
      const agentId = event.agentId;
      if (!agentId) return;

      store.update(agentId, { status: 'spawning' });

      // After a brief delay, transition to active
      setTimeout(() => {
        const current = store.get(agentId);
        if (current && current.status === 'spawning') {
          store.update(agentId, { status: 'active' });
        }
      }, 2000);
    },
  };
}
