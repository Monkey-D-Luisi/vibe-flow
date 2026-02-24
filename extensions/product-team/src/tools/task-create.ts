import type { ToolDef, ToolDeps } from './index.js';
import { TaskCreateParams } from '../schemas/task-create.schema.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../domain/task-record.js';

export function taskCreateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.create',
    label: 'Create Task',
    description: 'Create a new TaskRecord with initial backlog status',
    parameters: TaskCreateParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ title: string; scope?: 'major' | 'minor' | 'patch'; assignee?: string | null; tags?: string[]; metadata?: Record<string, unknown> }>(
        TaskCreateParams,
        params,
      );
      const id = deps.generateId();
      const now = deps.now();
      const task = createTaskRecord(input, id, now);
      const orchState = createOrchestratorState(id, now);

      // Wrap creation and event log in a single transaction for atomicity
      const created = deps.db.transaction(() => {
        const result = deps.taskRepo.create(task, orchState);
        deps.eventLog.logTaskCreated(id, null);
        return result;
      })();

      const result = { task: created };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
