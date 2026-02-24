import type { ToolDef, ToolDeps } from './index.js';
import { TaskNotFoundError } from '../domain/errors.js';
import {
  WorkflowStateGetParams,
  type WorkflowStateGetParams as WorkflowStateGetParamsType,
} from '../schemas/workflow-state-get.schema.js';
import { TRANSITION_GUARD_MATRIX } from '../orchestrator/transition-guards.js';

export function workflowStateGetToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'workflow.state.get',
    label: 'Get Workflow State',
    description: 'Get task workflow state, history, and transition guard matrix',
    parameters: WorkflowStateGetParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<WorkflowStateGetParamsType>(WorkflowStateGetParams, params);

      const task = deps.taskRepo.getById(input.id);
      if (!task) {
        throw new TaskNotFoundError(input.id);
      }

      const orchestratorState = deps.orchestratorRepo.getByTaskId(input.id);
      const history = deps.eventLog.getHistory(input.id);

      const result = {
        task,
        orchestratorState,
        history,
        transitionGuards: {
          matrix: TRANSITION_GUARD_MATRIX,
          config: deps.transitionGuardConfig,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
