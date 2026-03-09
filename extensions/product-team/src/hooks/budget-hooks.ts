/**
 * Budget lifecycle hooks for the plugin event system.
 *
 * Registers three hooks:
 * 1. after_tool_call (pipeline_start) -- ensure agent budget records exist
 * 2. before_tool_call -- enforce agent budget limits (block if exhausted)
 * 3. after_tool_call -- track per-agent token consumption
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { AgentBudgetTrackerDeps } from '../orchestrator/agent-budget-tracker.js';
import {
  extractTokenUsage,
  trackAgentConsumption,
  ensureAgentBudgets,
  checkAgentBudget,
} from '../orchestrator/agent-budget-tracker.js';

export function registerBudgetHooks(
  api: OpenClawPluginApi,
  deps: AgentBudgetTrackerDeps,
  knownAgentIds: readonly string[],
): void {
  // Ensure agent budgets are created when a pipeline starts
  api.on('after_tool_call', (event) => {
    try {
      if (event.toolName !== 'pipeline_start') return;
      const result = event.result as Record<string, unknown> | undefined;
      const details = (result?.['details'] ?? result) as Record<string, unknown> | undefined;
      const pipelineId = typeof details?.['pipelineId'] === 'string' ? details['pipelineId'] as string : undefined;
      if (!pipelineId) return;
      const created = ensureAgentBudgets(deps, pipelineId, knownAgentIds);
      if (created > 0) api.logger.info(`agent-budget: created ${created} agent budgets for pipeline ${pipelineId}`);
    } catch (err: unknown) {
      api.logger.warn(`agent-budget-ensure: error: ${String(err)}`);
    }
  });

  // Enforcement hook: block agent calls when agent budget is exhausted
  api.on('before_tool_call', (_event, ctx) => {
    try {
      const typedCtx = ctx as { agentId?: string; sessionKey?: string };
      const agentId = typedCtx.agentId;
      if (!agentId) return;
      const check = checkAgentBudget(deps, agentId);
      if (!check.allowed) {
        api.logger.warn(`agent-budget-enforcement: blocked ${agentId} (${check.scope}:${check.scopeId} exhausted)`);
      }
    } catch (err: unknown) {
      api.logger.warn(`agent-budget-enforcement: error: ${String(err)}`);
    }
  });

  // Track per-agent token consumption
  api.on('after_tool_call', (event, ctx) => {
    try {
      const typedCtx = ctx as { agentId?: string; sessionKey?: string };
      const agentId = typedCtx.agentId;
      if (!agentId) return;

      const usage = extractTokenUsage(event);
      if (!usage) return;

      // Resolve taskId from event result -- only use valid string IDs
      const result = event.result as Record<string, unknown> | undefined;
      const details = (result?.['details'] ?? result) as Record<string, unknown> | undefined;
      const rawTaskId = details?.['taskId'];
      const taskId = typeof rawTaskId === 'string' && rawTaskId.length > 0 ? rawTaskId : undefined;
      const pipelineId = typeof details?.['pipelineId'] === 'string'
        ? details['pipelineId'] as string
        : undefined;

      // Skip tracking if no valid taskId (event_log has FK on task_records)
      if (!taskId) return;

      trackAgentConsumption(
        deps,
        agentId,
        pipelineId,
        taskId,
        usage.inputTokens,
        usage.outputTokens,
        usage.provider,
        usage.model,
      );
    } catch (err: unknown) {
      api.logger.warn(`agent-budget-tracking: error: ${String(err)}`);
    }
  });

  api.logger.info('registered agent-budget hooks (ensure, enforce, track)');
}
