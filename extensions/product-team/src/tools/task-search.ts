import type { ToolDef, ToolDeps } from './index.js';
import { TaskSearchParams } from '../schemas/task-search.schema.js';
import type { TaskStatus } from '../domain/task-status.js';

export function taskSearchToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.search',
    label: 'Search Tasks',
    description: 'Search tasks by status, assignee, or tags',
    parameters: TaskSearchParams,
    execute: async (_toolCallId, params) => {
      const filters = deps.validate<{
        status?: TaskStatus;
        assignee?: string;
        tags?: string[];
        limit?: number;
        offset?: number;
      }>(TaskSearchParams, params);

      const tasks = deps.taskRepo.search(filters);

      const result = { tasks, count: tasks.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
