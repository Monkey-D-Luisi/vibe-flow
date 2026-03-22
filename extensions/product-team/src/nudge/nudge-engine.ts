/**
 * Nudge Engine
 *
 * Core orchestrator: collects agent/task state, builds nudge payloads,
 * dispatches via team.message, and returns a NudgeReport.
 *
 * Single entry point: executeNudge(options)
 */

import type { ToolDeps } from '../tools/index.js';
import type { NudgeReport, NudgedAgentEntry } from '../schemas/nudge.schema.js';
import { evaluateBlockedTasks } from './blocked-task-evaluator.js';
import { MESSAGES_TABLE, ensureMessagesTable } from '../tools/shared-db.js';

export interface NudgeOptions {
  scope?: 'all' | 'blocked' | 'active';
  agentIds?: string[];
  dryRun?: boolean;
  staleThresholdMs?: number;
}

function buildNudgeMessage(agentId: string, blockedCount: number): string {
  const parts = [
    `👋 Nudge for ${agentId}: please check your current focus and take the next action.`,
  ];
  if (blockedCount > 0) {
    parts.push(`There are ${blockedCount} stale pipeline task(s) that may need attention.`);
  }
  parts.push('Reply to this message with your current status or action taken.');
  return parts.join(' ');
}

export async function executeNudge(
  deps: ToolDeps,
  options: NudgeOptions = {},
): Promise<NudgeReport> {
  const scope = options.scope ?? 'all';
  const dryRun = options.dryRun ?? false;
  const now = deps.now();

  // 1. Detect blocked tasks
  const blockedTasks = evaluateBlockedTasks(deps.taskRepo, {
    staleThresholdMs: options.staleThresholdMs,
    nowMs: new Date(now).getTime(),
  });

  // 2. Determine which agents to nudge
  const agentConfig = deps.agentConfig ?? [];
  let targetAgents = agentConfig.map((a) => a.id);

  if (options.agentIds && options.agentIds.length > 0) {
    // Explicit list takes priority
    targetAgents = options.agentIds;
  } else if (scope === 'blocked') {
    // Only nudge owners of blocked pipeline stages
    const blockedOwnerIds = new Set(
      blockedTasks.map((t) => {
        const task = deps.taskRepo.getById(t.taskId);
        return task?.metadata?.['pipelineOwner'] as string | undefined;
      }).filter(Boolean) as string[],
    );
    targetAgents = [...blockedOwnerIds];
  } else if (scope === 'active') {
    // Only nudge agents that have an assigned in-progress task
    const assignedAgents = new Set<string>();
    const tasks = deps.taskRepo.search({ tags: ['pipeline'], limit: 200 });
    for (const task of tasks) {
      if (task.assignee && task.status !== 'done') {
        assignedAgents.add(task.assignee);
      }
    }
    targetAgents = [...assignedAgents];
  }

  // 3. Send nudge messages (or dry-run)
  const nudgedAgents: NudgedAgentEntry[] = [];

  // Always ensure the table exists so callers can safely query it after dry-run
  ensureMessagesTable(deps);

  for (const agentId of targetAgents) {
    const message = buildNudgeMessage(agentId, blockedTasks.length);
    const status: NudgedAgentEntry['status'] = dryRun ? 'dry-run' : 'nudged';

    if (!dryRun) {
      try {
        const msgId = deps.generateId();
        deps.db.prepare(`
          INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, origin_channel, origin_session_key, created_at)
          VALUES (?, ?, ?, ?, ?, 'normal', NULL, NULL, NULL, ?)
        `).run(msgId, 'nudge-engine', agentId, '👋 Agent Nudge', message, now);
      } catch (err: unknown) {
        deps.logger?.warn(`nudge message dispatch failed for ${agentId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    nudgedAgents.push({
      agentId,
      status,
      currentFocus: null,
      message,
    });
  }

  // 4. Emit event to event_log for observability
  try {
    const eventId = deps.generateId();
    deps.db.prepare(`
      INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
      VALUES (?, NULL, 'nudge.executed', 'nudge-engine', ?, ?)
    `).run(
      eventId,
      JSON.stringify({
        scope,
        dryRun,
        nudgedCount: nudgedAgents.length,
        blockedCount: blockedTasks.length,
      }),
      now,
    );
  } catch (err: unknown) {
    deps.logger?.warn(`nudge event_log write failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    nudgedAgents,
    blockedTasks,
    timestamp: now,
    dryRun,
  };
}
