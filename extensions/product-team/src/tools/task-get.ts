import type { ToolDef, ToolDeps } from './index.js';
import { TaskGetParams } from '../schemas/task-get.schema.js';
import { TaskNotFoundError } from '../domain/errors.js';

export function taskGetToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.get',
    label: 'Get Task',
    description: 'Retrieve a TaskRecord by its ULID',
    parameters: TaskGetParams,
    execute: async (_toolCallId, params) => {
      const { id } = deps.validate<{ id: string }>(TaskGetParams, params);
      const task = deps.taskRepo.getById(id);
      if (!task) {
        throw new TaskNotFoundError(id);
      }
      const orchestratorState = deps.orchestratorRepo.getByTaskId(id);

      const result = { task, orchestratorState };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
