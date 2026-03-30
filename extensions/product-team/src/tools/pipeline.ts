import type { ToolDef, ToolDeps } from './index.js';
import { PipelineStartParams, PipelineStatusParams, PipelineRetryParams, PipelineSkipParams } from '../schemas/pipeline.schema.js';
import { createTaskRecord, createOrchestratorState } from '../domain/task-record.js';
import { FULL_PIPELINE_STAGES, FULL_STAGE_OWNERS } from '../config/pipeline-presets.js';

export const PIPELINE_STAGES = FULL_PIPELINE_STAGES;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export const STAGE_OWNERS: Record<PipelineStage, string> = FULL_STAGE_OWNERS as Record<PipelineStage, string>;

/** Get the configured pipeline stages, falling back to the full 10-stage default. */
export function getConfiguredStages(config?: { pipelineStages?: readonly string[] }): readonly string[] {
  return config?.pipelineStages && config.pipelineStages.length > 0
    ? config.pipelineStages
    : PIPELINE_STAGES;
}

/** Get the configured stage owners, falling back to the full stage owners. */
export function getConfiguredStageOwners(config?: { stageOwners?: Readonly<Record<string, string>> }): Readonly<Record<string, string>> {
  return config?.stageOwners && Object.keys(config.stageOwners).length > 0
    ? config.stageOwners
    : STAGE_OWNERS;
}

export function getNextStage(current: string, customStages?: readonly string[]): string | null {
  const stages = customStages ?? PIPELINE_STAGES;
  const idx = stages.indexOf(current);
  if (idx < 0 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
}

/** Sync the pipeline_stage indexed column with the metadata value. */
function syncPipelineStageColumn(deps: ToolDeps, taskId: string, stage: string): void {
  try {
    deps.db.prepare('UPDATE task_records SET pipeline_stage = ? WHERE id = ?').run(stage, taskId);
  } catch {
    // Column may not exist yet if migration 003 hasn't run — silently ignore
  }
}

export function pipelineStartToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.start',
    label: 'Start Pipeline',
    description: 'Create a new task from an idea and start the autonomous pipeline',
    parameters: PipelineStartParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ ideaText: string; projectId?: string }>(PipelineStartParams, params);

      // Dedup guard: reject if there's already a pipeline with the same idea text
      // that hasn't completed yet. This prevents duplicate runs when agents
      // re-process the same idea from stale session context.
      try {
        const duplicates = deps.db.prepare(
          `SELECT id, title, pipeline_stage FROM task_records
           WHERE pipeline_stage IS NOT NULL
           AND pipeline_stage != 'DONE'
           AND title = ?
           LIMIT 1`,
        ).all(input.ideaText.slice(0, 200)) as Array<{ id: string; title: string; pipeline_stage: string }>;

        if (duplicates.length > 0) {
          const dup = duplicates[0]!;
          const dedupResult = {
            error: 'duplicate',
            reason: `Duplicate pipeline rejected: task "${dup.id}" with the same idea is already at stage ${dup.pipeline_stage}.`,
            existingTaskId: dup.id,
            existingStage: dup.pipeline_stage,
          };
          deps.logger?.warn(
            `pipeline.start: rejected duplicate idea — existing task ${dup.id} at ${dup.pipeline_stage}`,
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(dedupResult, null, 2) }],
            details: dedupResult,
          };
        }
      } catch {
        // pipeline_stage column may not exist — proceed without guard
      }

      const id = deps.generateId();
      const now = deps.now();
      const stageOwners = getConfiguredStageOwners(deps.orchestratorConfig);
      const task = createTaskRecord(
        {
          title: input.ideaText.slice(0, 200),
          scope: 'minor',
          tags: ['pipeline', 'idea'],
          metadata: {
            pipelineStage: 'IDEA',
            pipelineOwner: stageOwners['IDEA'] ?? 'pm',
            projectId: input.projectId ?? deps.projectConfig?.activeProject ?? null,
            ideaText: input.ideaText,
            pipelineStartedAt: now,
          },
        },
        id,
        now,
      );
      const orchState = createOrchestratorState(id, now);

      const created = deps.db.transaction(() => {
        const result = deps.taskRepo.create(task, orchState);
        deps.eventLog.logTaskCreated(id, 'system');
        return result;
      })();

      syncPipelineStageColumn(deps, id, 'IDEA');
      deps.logger?.info(`pipeline.start: Created pipeline task ${id} from idea`);

      const result = { taskId: id, status: 'IDEA' as const, title: created.title };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function pipelineStatusToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.status',
    label: 'Pipeline Status',
    description: 'Get the status of active pipeline tasks',
    parameters: PipelineStatusParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId?: string }>(PipelineStatusParams, params);

      if (input.taskId) {
        const task = deps.taskRepo.getById(input.taskId);
        if (!task) {
          const result = { tasks: [], error: `Task "${input.taskId}" not found` };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        }
        const meta = task.metadata as Record<string, unknown> | undefined;
        const result = {
          tasks: [{
            id: task.id,
            title: task.title,
            stage: meta?.pipelineStage ?? 'unknown',
            owner: meta?.pipelineOwner ?? 'unknown',
            status: task.status,
            startedAt: meta?.pipelineStartedAt ?? null,
          }],
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      // List all pipeline tasks
      const allTasks = deps.taskRepo.search({ tags: ['pipeline'] });
      const tasks = allTasks.map((t) => {
        const meta = t.metadata as Record<string, unknown> | undefined;
        return {
          id: t.id,
          title: t.title,
          stage: meta?.pipelineStage ?? 'unknown',
          owner: meta?.pipelineOwner ?? 'unknown',
          status: t.status,
          startedAt: meta?.pipelineStartedAt ?? null,
        };
      });

      const result = { tasks, count: tasks.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function pipelineRetryToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.retry',
    label: 'Retry Pipeline Stage',
    description: 'Manually retry a failed pipeline stage',
    parameters: PipelineRetryParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId: string; stage?: string }>(PipelineRetryParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        const result = { retried: false, reason: `Task "${input.taskId}" not found` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const meta = task.metadata as Record<string, unknown> | undefined;
      const currentStage = String(meta?.pipelineStage ?? 'IDEA');
      const retryStage = input.stage ?? currentStage;

      const configuredStages = getConfiguredStages(deps.orchestratorConfig);
      const stageOwners = getConfiguredStageOwners(deps.orchestratorConfig);
      if (!configuredStages.includes(retryStage)) {
        const result = { retried: false, reason: `Invalid stage "${retryStage}". Must be one of: ${configuredStages.join(', ')}` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      deps.taskRepo.update(input.taskId, {
        metadata: {
          ...(meta ?? {}),
          pipelineStage: retryStage,
          pipelineOwner: stageOwners[retryStage] ?? 'system',
          retryCount: (typeof meta?.retryCount === 'number' ? meta.retryCount : 0) + 1,
        },
      }, task.rev, deps.now());

      syncPipelineStageColumn(deps, input.taskId, retryStage);
      deps.logger?.info(`pipeline.retry: Task ${input.taskId} stage ${retryStage}`);

      const result = { retried: true, taskId: input.taskId, stage: retryStage };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function pipelineSkipToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'pipeline.skip',
    label: 'Skip Pipeline Stage',
    description: 'Skip a pipeline stage (e.g., skip DESIGN for backend-only tasks)',
    parameters: PipelineSkipParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId: string; stage: string; reason: string }>(PipelineSkipParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        const result = { skipped: false, reason: `Task "${input.taskId}" not found` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const meta = task.metadata as Record<string, unknown> | undefined;

      const configuredStages = getConfiguredStages(deps.orchestratorConfig);
      const stageOwners = getConfiguredStageOwners(deps.orchestratorConfig);
      if (!configuredStages.includes(input.stage)) {
        const result = { skipped: false, reason: `Invalid stage "${input.stage}". Must be one of: ${configuredStages.join(', ')}` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const nextStage = getNextStage(input.stage, configuredStages);

      if (!nextStage) {
        const result = { skipped: false, reason: `No next stage after "${input.stage}"` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      deps.taskRepo.update(input.taskId, {
        metadata: {
          ...(meta ?? {}),
          pipelineStage: nextStage,
          pipelineOwner: stageOwners[nextStage] ?? 'system',
          [`${input.stage}_skipped`]: true,
          [`${input.stage}_skipReason`]: input.reason,
        },
      }, task.rev, deps.now());

      syncPipelineStageColumn(deps, input.taskId, nextStage);
      deps.logger?.info(`pipeline.skip: Task ${input.taskId} skipped ${input.stage} → ${nextStage}`);

      const result = { skipped: true, taskId: input.taskId, skippedStage: input.stage, nextStage };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
