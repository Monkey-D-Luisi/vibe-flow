import type { ToolDef, ToolDeps } from './index.js';
import { TaskUpdateParams } from '../schemas/task-update.schema.js';

export function taskUpdateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.update',
    label: 'Update Task',
    description: 'Update mutable fields on a TaskRecord (requires rev for optimistic locking)',
    parameters: TaskUpdateParams,
    execute: async (_toolCallId, params) => {
      const { id, rev, ...fields } = deps.validate<{
        id: string;
        rev: number;
        title?: string;
        scope?: 'major' | 'minor' | 'patch';
        assignee?: string | null;
        tags?: string[];
        metadata?: Record<string, unknown>;
      }>(TaskUpdateParams, params);

      const now = deps.now();
      const updated = deps.taskRepo.update(id, fields, rev, now);
      const changedFields = Object.keys(fields);
      if (changedFields.length > 0) {
        deps.eventLog.logTaskUpdated(id, changedFields, null);
      }

      const result = { task: updated };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
