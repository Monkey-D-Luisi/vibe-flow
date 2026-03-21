/**
 * Timeline Utilities (EP14, Task 0101)
 *
 * Shared stage timeline computation from event_log entries.
 * Used by both the pipeline.timeline tool and the GET /api/timeline HTTP endpoint.
 */

import type Database from 'better-sqlite3';

export interface StageTimelineEntry {
  readonly stage: string;
  readonly enteredAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly agentId: string | null;
}

export interface TaskTimeline {
  readonly taskId: string;
  readonly title: string;
  readonly currentStage: string;
  readonly stages: StageTimelineEntry[];
  readonly totalDurationMs: number | null;
}

/**
 * Build a stage timeline for a task from event_log stage events.
 * Queries pipeline.stage.entered and pipeline.stage.completed events.
 */
export function computeStageTimeline(
  db: Database.Database,
  taskId: string,
): StageTimelineEntry[] {
  const rows = db
    .prepare(
      `SELECT event_type, agent_id, payload, created_at
       FROM event_log
       WHERE task_id = ? AND event_type IN ('pipeline.stage.entered', 'pipeline.stage.completed')
       ORDER BY created_at ASC`,
    )
    .all(taskId) as Array<{
    event_type: string;
    agent_id: string | null;
    payload: string;
    created_at: string;
  }>;

  // Build a map of stage -> { enteredAt, completedAt, agentId }
  const stageMap = new Map<string, {
    enteredAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    agentId: string | null;
  }>();

  // Track stage ordering
  const stageOrder: string[] = [];

  for (const row of rows) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      // skip malformed payloads
    }

    const stage = typeof parsed['stage'] === 'string' ? parsed['stage'] : null;
    if (!stage) continue;

    if (!stageMap.has(stage)) {
      stageMap.set(stage, { enteredAt: null, completedAt: null, durationMs: null, agentId: null });
      stageOrder.push(stage);
    }

    const entry = stageMap.get(stage)!;

    if (row.event_type === 'pipeline.stage.entered') {
      entry.enteredAt = row.created_at;
      entry.agentId = row.agent_id ?? (typeof parsed['agentId'] === 'string' ? parsed['agentId'] : null);
    } else if (row.event_type === 'pipeline.stage.completed') {
      entry.completedAt = row.created_at;
      if (typeof parsed['durationMs'] === 'number') {
        entry.durationMs = parsed['durationMs'];
      } else if (entry.enteredAt) {
        entry.durationMs = new Date(row.created_at).getTime() - new Date(entry.enteredAt).getTime();
      }
      if (!entry.agentId) {
        entry.agentId = row.agent_id ?? (typeof parsed['agentId'] === 'string' ? parsed['agentId'] : null);
      }
    }
  }

  return stageOrder.map((stage) => {
    const entry = stageMap.get(stage)!;
    return {
      stage,
      enteredAt: entry.enteredAt,
      completedAt: entry.completedAt,
      durationMs: entry.durationMs,
      agentId: entry.agentId,
    };
  });
}

/**
 * Get task IDs that have active pipelines (i.e. have stage events but have not entered DONE).
 * Note: pipeline_advance emits pipeline.stage.entered for DONE but NOT pipeline.stage.completed
 * for DONE, so we detect completion via the entered event for the DONE stage.
 */
export function getActivePipelineTaskIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT task_id
       FROM event_log
       WHERE event_type = 'pipeline.stage.entered'
         AND task_id NOT IN (
           SELECT task_id FROM event_log
           WHERE event_type = 'pipeline.stage.entered'
             AND json_extract(payload, '$.stage') = 'DONE'
         )
       ORDER BY task_id`,
    )
    .all() as Array<{ task_id: string }>;

  return rows.map((r) => r.task_id);
}
