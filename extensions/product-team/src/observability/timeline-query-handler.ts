/**
 * Timeline Query HTTP Handler (EP14, Task 0101)
 *
 * GET /api/timeline -- returns pipeline stage timeline data.
 * Optional ?taskId= parameter filters to a specific task.
 * Without taskId, returns timelines for all active pipeline tasks.
 */

import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { computeStageTimeline, getActivePipelineTaskIds } from './timeline-utils.js';

export interface TimelineQueryDeps {
  readonly db: Database.Database;
  readonly now: () => string;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function createTimelineQueryHandler(
  deps: TimelineQueryDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const baseUrl = `http://localhost${req.url ?? '/'}`;
    const url = new URL(baseUrl);
    const taskId = url.searchParams.get('taskId');

    if (taskId) {
      // Single task timeline
      const task = deps.db
        .prepare('SELECT id, title FROM task_records WHERE id = ?')
        .get(taskId) as { id: string; title: string } | undefined;

      if (!task) {
        sendJson(res, 404, { error: `Task not found: ${taskId}` });
        return;
      }

      const stages = computeStageTimeline(deps.db, taskId);
      const totalDurationMs = stages.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) || null;

      // Determine current stage (last entered stage without completion)
      const currentStage = stages.length > 0
        ? (stages.find((s) => s.enteredAt && !s.completedAt)?.stage ?? stages[stages.length - 1].stage)
        : 'UNKNOWN';

      sendJson(res, 200, {
        timestamp: deps.now(),
        taskId: task.id,
        title: task.title,
        currentStage,
        stages,
        totalDurationMs,
      });
      return;
    }

    // All active pipeline tasks
    const activeTaskIds = getActivePipelineTaskIds(deps.db);
    const timelines = activeTaskIds.map((tid) => {
      const task = deps.db
        .prepare('SELECT id, title FROM task_records WHERE id = ?')
        .get(tid) as { id: string; title: string } | undefined;

      const stages = computeStageTimeline(deps.db, tid);
      const totalDurationMs = stages.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) || null;
      const currentStage = stages.length > 0
        ? (stages.find((s) => s.enteredAt && !s.completedAt)?.stage ?? stages[stages.length - 1].stage)
        : 'UNKNOWN';

      return {
        taskId: tid,
        title: task?.title ?? 'Unknown',
        currentStage,
        stages,
        totalDurationMs,
      };
    });

    sendJson(res, 200, {
      timestamp: deps.now(),
      activeTasks: timelines.length,
      timelines,
    });
  };
}
