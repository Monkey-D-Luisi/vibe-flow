/**
 * agent.nudge MCP Tool
 *
 * Exposes the nudge-engine as a callable tool: agent.nudge.
 * Accepts NudgeToolParams, returns NudgeReport.
 */

import type { ToolDef, ToolDeps } from './index.js';
import { NudgeToolParams } from '../schemas/nudge.schema.js';
import { executeNudge } from '../nudge/nudge-engine.js';

export function agentNudgeToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'agent.nudge',
    label: 'Nudge Agents',
    description:
      'Wake up agents and surface blocked tasks. Sends a message to each target agent and returns a NudgeReport.',
    parameters: NudgeToolParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{
        scope?: 'all' | 'blocked' | 'active';
        agentIds?: string[];
        dryRun?: boolean;
        staleThresholdMs?: number;
      }>(NudgeToolParams, params);

      const report = await executeNudge(deps, {
        scope: input.scope,
        agentIds: input.agentIds,
        dryRun: input.dryRun,
        staleThresholdMs: input.staleThresholdMs,
      });

      deps.logger?.info(
        `agent.nudge: scope=${input.scope ?? 'all'} dryRun=${input.dryRun ?? false} nudged=${report.nudgedAgents.length} blocked=${report.blockedTasks.length}`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
        details: report,
      };
    },
  };
}
