/**
 * Event Mapper -- Maps OpenClaw lifecycle hook events to agent state changes.
 *
 * Provides handler functions for before_tool_call, after_tool_call,
 * agent_end, and subagent_spawned hooks.
 */

import type { AgentStateStore } from './agent-state-store.js';
import { STAGE_OWNERS, type PipelineStage } from '../shared/stage-location-map.js';

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

interface PipelineExtraction {
  readonly stage: unknown;
  readonly taskId: unknown;
}

export interface EventMapperLogger {
  info(op: string, ctx?: Record<string, unknown>): void;
  warn(op: string, ctx?: Record<string, unknown>): void;
}

const noopLogger: EventMapperLogger = { info() {}, warn() {} };

/**
 * Declarative map of pipeline tool names to extraction logic.
 * Each extractor reads the relevant fields from the tool result details.
 * Keeps pipeline state extraction maintainable -- adding a new pipeline tool
 * is a one-liner instead of a new if-block.
 */
const PIPELINE_EXTRACTORS: Record<string, (d: Record<string, unknown>) => PipelineExtraction> = {
  pipeline_start:    (d) => ({ stage: d['status'],       taskId: d['taskId'] }),
  pipeline_advance:  (d) => ({ stage: d['currentStage'], taskId: d['taskId'] }),
  pipeline_skip:     (d) => ({ stage: d['nextStage'],    taskId: d['taskId'] }),
  pipeline_retry:    (d) => ({ stage: d['stage'],        taskId: d['taskId'] }),
  pipeline_timeline: (d) => ({ stage: d['currentStage'], taskId: d['taskId'] }),
};

function extractDetails(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null;

  const obj = result as Record<string, unknown>;
  const details = obj['details'];
  if (details && typeof details === 'object') {
    return details as Record<string, unknown>;
  }

  return obj;
}

/**
 * Propagate pipeline context to the stage owner agent.
 * When PM calls pipeline_advance and the result says currentStage: 'IMPLEMENTATION',
 * the owner (back-1) should also get pipelineStage + taskId set so the pipeline
 * panel correctly attributes the work.
 */
function propagateToStageOwner(
  store: AgentStateStore,
  callerAgentId: string,
  stage: string,
  taskId: unknown,
  logger: EventMapperLogger = noopLogger,
): void {
  const owner = STAGE_OWNERS[stage as PipelineStage];
  if (!owner || owner === callerAgentId || owner === 'system') return;

  const partial: Record<string, unknown> = { pipelineStage: stage };
  if (typeof taskId === 'string') partial['taskId'] = taskId;
  store.update(owner, partial);
  logger.info('pipeline.context.propagated', { from: callerAgentId, to: owner, stage, taskId });
}

/**
 * Create lifecycle hook handlers that update the agent state store.
 */
export function createEventHandlers(store: AgentStateStore, logger: EventMapperLogger = noopLogger) {
  return {
    /** Handle before_tool_call: agent becomes active. */
    onBeforeToolCall(event: ToolCallEvent, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;

      const current = store.get(agentId);
      const seq = (current?.toolCallSeq ?? 0) + 1;

      const partial: Record<string, unknown> = {
        status: 'active',
        currentTool: event.toolName,
        toolCallSeq: seq,
      };

      // Extract taskId from params (works for any tool that passes taskId)
      if (event.params) {
        const taskId = event.params['taskId'] ?? event.params['task_id'];
        if (typeof taskId === 'string') {
          partial['taskId'] = taskId;
        }
      }

      store.update(agentId, partial);

      // Infer pipeline context from other agents with the same taskId.
      // Covers team-message workflows where agents receive work via team_reply
      // rather than being spawned by pipeline_advance.
      const taskId = partial['taskId'] as string | undefined;
      if (taskId) {
        const current = store.get(agentId);
        if (!current?.pipelineStage) {
          const donor = store.getAll()
            .filter(s => s.agentId !== agentId && s.taskId === taskId && s.pipelineStage)
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];
          if (donor) {
            store.update(agentId, { pipelineStage: donor.pipelineStage });
            logger.info('pipeline.context.inherited', {
              agentId, taskId, stage: donor.pipelineStage, donor: donor.agentId,
            });
          }
        }
      }
    },

    /** Handle after_tool_call: record result, clear tool. */
    onAfterToolCall(event: ToolCallEvent, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;
      const details = extractDetails(event.result);

      store.update(agentId, {
        status: 'active',
        currentTool: null,
      });

      if (!details) return;

      // Declarative pipeline extraction
      const extractor = PIPELINE_EXTRACTORS[event.toolName];
      if (extractor) {
        const extracted = extractor(details);
        if (typeof extracted.stage === 'string') {
          const partial: Record<string, unknown> = { pipelineStage: extracted.stage };
          if (typeof extracted.taskId === 'string') partial['taskId'] = extracted.taskId;
          store.update(agentId, partial);
          propagateToStageOwner(store, agentId, extracted.stage, extracted.taskId, logger);
          logger.info('pipeline.context.set', {
            agentId, stage: extracted.stage, taskId: extracted.taskId, tool: event.toolName,
          });
        }
        return;
      }

      // Special case: pipeline_status with single-task result
      if (event.toolName === 'pipeline_status') {
        const tasks = details['tasks'];
        if (Array.isArray(tasks) && tasks.length === 1) {
          const task = tasks[0] as Record<string, unknown>;
          const stage = task['stage'];
          const taskId = task['id'];
          if (typeof stage === 'string') {
            const partial: Record<string, unknown> = { pipelineStage: stage };
            if (typeof taskId === 'string') partial['taskId'] = taskId;
            store.update(agentId, partial);
          }
        }
      }
    },

    /** Handle agent_end: agent returns to idle.
     * taskId and pipelineStage are intentionally kept -- they represent
     * the last known task context and remain visible in the pipeline
     * dashboard for a grace period before expiring by lastSeenAt. */
    onAgentEnd(_event: unknown, ctx: HookContext): void {
      const agentId = ctx.agentId;
      if (!agentId) return;

      store.update(agentId, {
        status: 'idle',
        currentTool: null,
      });
    },

    /** Handle subagent_spawned: agent is spawning.
     * Inherits pipeline context from the most recently active agent
     * as a safety net (propagateToStageOwner should already have set
     * the context in most cases). */
    onSubagentSpawned(event: SubagentSpawnedEvent): void {
      const agentId = event.agentId;
      if (!agentId) return;

      // Find the most recently seen agent with pipeline context to use as donor
      const allStates = store.getAll();
      const donor = allStates
        .filter(s => s.agentId !== agentId && s.taskId && s.pipelineStage)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];

      const partial: Record<string, unknown> = { status: 'spawning' };
      if (donor) {
        partial['taskId'] = donor.taskId;
        partial['pipelineStage'] = donor.pipelineStage;
        logger.info('pipeline.context.inherited.spawn', {
          agentId, taskId: donor.taskId, stage: donor.pipelineStage, donor: donor.agentId,
        });
      }
      store.update(agentId, partial);

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
