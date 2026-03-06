/**
 * Pipeline Advance & Metrics Tools (EP09)
 *
 * Implements:
 * - 0062: pipeline.advance — automatic stage advancement
 * - 0064: per-stage retry limit enforcement
 * - 0065: conditional design skip for non-UI tasks
 * - 0072: per-stage metrics collection via pipeline.metrics
 * - 0074: structured stage transition events emitted to event_log
 */

import type { ToolDef, ToolDeps } from './index.js';
import { PIPELINE_STAGES, STAGE_OWNERS, getNextStage, type PipelineStage } from './pipeline.js';
import { Type } from '@sinclair/typebox';

const PipelineAdvanceParams = Type.Object({
  taskId: Type.String({ minLength: 1, description: 'Task ID to advance to the next pipeline stage' }),
  skipDesign: Type.Optional(Type.Boolean({ description: 'Force skip DESIGN stage (for non-UI tasks)' })),
});

const PipelineMetricsParams = Type.Object({
  taskId: Type.Optional(Type.String({ description: 'Specific task ID, or all pipeline tasks if omitted' })),
});

/** Sync the pipeline_stage indexed column with the metadata value. */
function syncPipelineStageColumn(deps: ToolDeps, taskId: string, stage: string): void {
  try {
    deps.db.prepare('UPDATE task_records SET pipeline_stage = ? WHERE id = ?').run(stage, taskId);
  } catch {
    // Column may not exist yet if migration 003 hasn't run
  }
}

/** Emit a stage transition event to the event log for observability (Task 0074). */
function emitStageEvent(
  deps: ToolDeps,
  taskId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  try {
    const id = deps.generateId();
    const now = deps.now();
    deps.db.prepare(`
      INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, eventType, payload['agentId'] as string ?? 'system', JSON.stringify(payload), now);
  } catch {
    // event_log table may not be ready
  }
}

export function pipelineAdvanceToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.advance',
    label: 'Advance Pipeline Stage',
    description: 'Advance a pipeline task to the next stage, spawning the stage owner',
    parameters: PipelineAdvanceParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId: string; skipDesign?: boolean }>(PipelineAdvanceParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ advanced: false, reason: 'Task not found' }) }],
          details: { advanced: false, reason: 'Task not found' },
        };
      }

      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      const currentStage = String(meta.pipelineStage ?? 'IDEA');
      const now = deps.now();

      // Caller validation: only the current stage owner (or pm/tech-lead as
      // coordinators) may advance the pipeline. The _callerAgentId field is
      // injected by the pipeline-caller-injection before_tool_call hook.
      const callerAgentId = (params as Record<string, unknown>)['_callerAgentId'] as string | undefined;
      if (callerAgentId) {
        const currentOwner = STAGE_OWNERS[currentStage as PipelineStage] ?? 'system';
        const allowedCallers = new Set([currentOwner, 'pm', 'tech-lead']);
        if (!allowedCallers.has(callerAgentId)) {
          const reason = `Caller "${callerAgentId}" is not authorized to advance stage ${currentStage} (owner: ${currentOwner})`;
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ advanced: false, reason }) }],
            details: { advanced: false, reason },
          };
        }
      }

      // Task 0064: Per-stage retry limit enforcement
      const maxRetries = deps.orchestratorConfig?.maxRetriesPerStage ?? 1;
      const stageRetryKey = `${currentStage}_retries`;
      const stageRetries = typeof meta[stageRetryKey] === 'number' ? meta[stageRetryKey] as number : 0;

      if (stageRetries > maxRetries) {
        const escalateResult = {
          advanced: false,
          reason: `Stage ${currentStage} exceeded max retries (${stageRetries}/${maxRetries}). Escalating to tech-lead.`,
          escalated: true,
        };
        emitStageEvent(deps, input.taskId, 'pipeline.stage.retry_exceeded', {
          stage: currentStage,
          retries: stageRetries,
          maxRetries,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(escalateResult, null, 2) }],
          details: escalateResult,
        };
      }

      let targetStage = getNextStage(currentStage);
      if (!targetStage) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ advanced: false, reason: `Already at final stage: ${currentStage}` }) }],
          details: { advanced: false, reason: `Already at final stage: ${currentStage}` },
        };
      }

      // Task 0065: Conditional design skip for non-UI tasks
      let designSkipReason: string | null = null;
      const skipDesignConfig = deps.orchestratorConfig?.skipDesignForNonUITasks ?? false;
      const isNonUITask = meta.taskType === 'backend' || meta.taskType === 'infra' || meta.taskType === 'devops';
      if (targetStage === 'DESIGN' && (input.skipDesign || (skipDesignConfig && isNonUITask))) {
        designSkipReason = input.skipDesign
          ? 'Explicitly skipped by caller'
          : 'Auto-skipped: non-UI task (skipDesignForNonUITasks=true)';

        // Record skip and advance past DESIGN
        const afterDesign = getNextStage('DESIGN');
        if (afterDesign) {
          emitStageEvent(deps, input.taskId, 'pipeline.stage.skipped', {
            stage: 'DESIGN',
            reason: designSkipReason,
          });
          targetStage = afterDesign;
        }
      }

      // Record stage completion metrics for the outgoing stage (Task 0072)
      const stageStartKey = `${currentStage}_startedAt`;
      const stageStartedAt = typeof meta[stageStartKey] === 'string' ? meta[stageStartKey] as string : null;
      const durationMs = stageStartedAt ? Date.now() - new Date(stageStartedAt).getTime() : null;

      // Emit stage completion event (Task 0074)
      emitStageEvent(deps, input.taskId, 'pipeline.stage.completed', {
        stage: currentStage,
        durationMs,
        agentId: STAGE_OWNERS[currentStage as PipelineStage] ?? 'system',
      });

      // Emit stage entered event (Task 0074)
      emitStageEvent(deps, input.taskId, 'pipeline.stage.entered', {
        stage: targetStage,
        agentId: STAGE_OWNERS[targetStage] ?? 'system',
      });

      // Update metadata with new stage and stage timing
      const updatedMeta = {
        ...meta,
        pipelineStage: targetStage,
        pipelineOwner: STAGE_OWNERS[targetStage] ?? 'system',
        [`${currentStage}_completedAt`]: now,
        [`${currentStage}_durationMs`]: durationMs,
        [`${targetStage}_startedAt`]: now,
      };

      // If design was skipped, record it
      if (designSkipReason) {
        updatedMeta['DESIGN_skipped'] = true;
        updatedMeta['DESIGN_skipReason'] = designSkipReason;
      }

      deps.taskRepo.update(input.taskId, { metadata: updatedMeta }, task.rev, now);
      syncPipelineStageColumn(deps, input.taskId, targetStage);

      deps.logger?.info(`pipeline.advance: ${input.taskId} ${currentStage} → ${targetStage}`);

      const result = {
        advanced: true,
        taskId: input.taskId,
        previousStage: currentStage,
        currentStage: targetStage,
        owner: STAGE_OWNERS[targetStage] ?? 'system',
        durationMs,
        nextAction: targetStage !== 'DONE' ? {
          action: 'spawn_subagent',
          agentId: STAGE_OWNERS[targetStage] ?? 'system',
          task: `Pipeline task ${input.taskId} has advanced to ${targetStage}. ` +
            `You are the stage owner. Execute the ${targetStage} stage work, ` +
            `then call pipeline_advance to move to the next stage.`,
        } : undefined,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

/**
 * Pipeline metrics tool (Task 0072).
 * Aggregates per-stage timing and retry data from pipeline task metadata.
 */
export function pipelineMetricsToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.metrics',
    label: 'Pipeline Metrics',
    description: 'Get per-stage metrics (duration, retries) for pipeline tasks',
    parameters: PipelineMetricsParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId?: string }>(PipelineMetricsParams, params);

      const tasks = input.taskId
        ? [deps.taskRepo.getById(input.taskId)].filter(Boolean)
        : deps.taskRepo.search({ tags: ['pipeline'] });

      const stageStats: Record<string, { count: number; totalDurationMs: number; totalRetries: number }> = {};

      for (const task of tasks) {
        if (!task) continue;
        const meta = (task.metadata ?? {}) as Record<string, unknown>;

        for (const stage of PIPELINE_STAGES) {
          const durationKey = `${stage}_durationMs`;
          const retriesKey = `${stage}_retries`;
          const duration = typeof meta[durationKey] === 'number' ? meta[durationKey] as number : 0;
          const retries = typeof meta[retriesKey] === 'number' ? meta[retriesKey] as number : 0;

          if (duration > 0 || retries > 0) {
            if (!stageStats[stage]) {
              stageStats[stage] = { count: 0, totalDurationMs: 0, totalRetries: 0 };
            }
            stageStats[stage].count++;
            stageStats[stage].totalDurationMs += duration;
            stageStats[stage].totalRetries += retries;
          }
        }
      }

      const stages = Object.entries(stageStats).map(([stage, stats]) => ({
        stage,
        taskCount: stats.count,
        avgDurationMs: stats.count > 0 ? Math.round(stats.totalDurationMs / stats.count) : 0,
        totalRetries: stats.totalRetries,
      }));

      const result = { stages, taskCount: tasks.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
