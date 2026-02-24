import type { ToolDef, ToolDeps } from './index.js';
import { TaskTransitionParams } from '../schemas/task-transition.schema.js';
import { transition } from '../orchestrator/state-machine.js';
import type { TaskStatus } from '../domain/task-status.js';

export function taskTransitionToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.transition',
    label: 'Transition Task',
    description: 'Transition a task to a new state (validates against state machine)',
    parameters: TaskTransitionParams,
    execute: async (_toolCallId, params) => {
      const { id, toStatus, agentId, rev } = deps.validate<{
        id: string;
        toStatus: TaskStatus;
        agentId: string;
        rev: number;
      }>(TaskTransitionParams, params);

      const result = transition(id, toStatus, agentId, rev, {
        db: deps.db,
        taskRepo: deps.taskRepo,
        orchestratorRepo: deps.orchestratorRepo,
        leaseRepo: deps.leaseRepo,
        eventLog: deps.eventLog,
        now: deps.now,
        guardConfig: deps.transitionGuardConfig,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
