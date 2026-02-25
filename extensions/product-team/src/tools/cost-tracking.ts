import { applyBudgetWarnings, buildCostSummary, getTaskBudget } from '../cost/cost-summary.js';
import { StaleRevisionError } from '../domain/errors.js';
import type { ToolDef, ToolDeps } from './index.js';

type ToolResult = Awaited<ReturnType<ToolDef['execute']>>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveTaskId(params: Record<string, unknown>, result: ToolResult | null): string | null {
  const fromParams = asString(params.taskId) ?? asString(params.id);
  if (fromParams) {
    return fromParams;
  }

  if (!result) {
    return null;
  }

  const details = asRecord(result.details);
  const task = asRecord(details?.task);
  return asString(task?.id) ?? asString(details?.taskId);
}

function resolveAgentId(params: Record<string, unknown>): string | null {
  return asString(params.agentId);
}

function logCostTrackingWarning(
  deps: ToolDeps,
  toolName: string,
  taskId: string,
  error: unknown,
): void {
  deps.logger?.warn?.(
    JSON.stringify({
      op: 'cost.tracking.warn',
      toolName,
      taskId,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

function updateBudgetWarningsForTask(
  deps: ToolDeps,
  taskId: string,
  agentId: string | null,
): void {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const task = deps.taskRepo.getById(taskId);
    if (!task) {
      return;
    }

    const budget = getTaskBudget(task.metadata);
    if (!budget) {
      return;
    }

    const summary = buildCostSummary(deps.eventLog.getHistory(taskId));
    const tokenLimitExceeded =
      budget.maxTokens !== undefined && summary.totalTokens > budget.maxTokens;
    const durationLimitExceeded =
      budget.maxDurationMs !== undefined && summary.totalDurationMs > budget.maxDurationMs;

    const currentWarnings = budget.warnings ?? {};
    const newTokenWarning = tokenLimitExceeded && currentWarnings.tokenLimitExceeded !== true;
    const newDurationWarning =
      durationLimitExceeded && currentWarnings.durationLimitExceeded !== true;

    if (!newTokenWarning && !newDurationWarning) {
      return;
    }

    if (newTokenWarning && budget.maxTokens !== undefined) {
      deps.eventLog.logBudgetWarning(taskId, agentId, {
        kind: 'tokens',
        total: summary.totalTokens,
        limit: budget.maxTokens,
      });
    }

    if (newDurationWarning && budget.maxDurationMs !== undefined) {
      deps.eventLog.logBudgetWarning(taskId, agentId, {
        kind: 'duration',
        total: summary.totalDurationMs,
        limit: budget.maxDurationMs,
      });
    }

    const metadataWithWarnings = applyBudgetWarnings(task.metadata, {
      ...(newTokenWarning ? { tokenLimitExceeded: true } : {}),
      ...(newDurationWarning ? { durationLimitExceeded: true } : {}),
    });

    try {
      deps.taskRepo.update(
        task.id,
        { metadata: metadataWithWarnings },
        task.rev,
        deps.now(),
      );
      return;
    } catch (error: unknown) {
      if (error instanceof StaleRevisionError) {
        continue;
      }
      throw error;
    }
  }
}

export function withCostTracking(tool: ToolDef, deps: ToolDeps): ToolDef {
  return {
    ...tool,
    execute: async (toolCallId, params) => {
      const startedAt = Date.now();
      let result: ToolResult | null = null;
      let succeeded = false;

      try {
        result = await tool.execute(toolCallId, params);
        succeeded = true;
        return result;
      } finally {
        const taskId = resolveTaskId(params, result);
        if (taskId) {
          const agentId = resolveAgentId(params);
          try {
            deps.eventLog.logToolCost(taskId, agentId, {
              toolName: tool.name,
              durationMs: Math.max(0, Date.now() - startedAt),
              success: succeeded,
            });
            updateBudgetWarningsForTask(deps, taskId, agentId);
          } catch (error: unknown) {
            logCostTrackingWarning(deps, tool.name, taskId, error);
          }
        }
      }
    },
  };
}
