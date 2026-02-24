import type { ToolDef, ToolDeps } from './index.js';
import { ValidationError } from '../domain/errors.js';
import {
  WorkflowStepRunParams,
  type WorkflowStepRunParams as WorkflowStepRunParamsType,
} from '../schemas/workflow-step-run.schema.js';
import { runWorkflowSteps } from '../orchestrator/step-runner.js';
import { transition } from '../orchestrator/state-machine.js';

export function workflowStepRunToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'workflow.step.run',
    label: 'Run Workflow Steps',
    description: 'Run ordered workflow steps, validate role outputs, and optionally transition state',
    parameters: WorkflowStepRunParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<WorkflowStepRunParamsType>(WorkflowStepRunParams, params);

      if (input.toStatus && input.orchestratorRev === undefined) {
        throw new ValidationError('orchestratorRev is required when toStatus is provided');
      }

      const outerTx = deps.db.transaction(() => {
        const stepResult = runWorkflowSteps(
          {
            taskId: input.id,
            agentId: input.agentId,
            rev: input.rev,
            steps: input.steps,
          },
          {
            db: deps.db,
            taskRepo: deps.taskRepo,
            eventLog: deps.eventLog,
            validate: deps.validate,
            now: deps.now,
          },
        );

        let transitionResult: ReturnType<typeof transition> | null = null;
        if (input.toStatus) {
          transitionResult = transition(
            input.id,
            input.toStatus,
            input.agentId,
            input.orchestratorRev!,
            {
              db: deps.db,
              taskRepo: deps.taskRepo,
              orchestratorRepo: deps.orchestratorRepo,
              leaseRepo: deps.leaseRepo,
              eventLog: deps.eventLog,
              now: deps.now,
              guardConfig: deps.transitionGuardConfig,
            },
          );
        }

        return {
          task: stepResult.task,
          steps: stepResult.steps,
          transition: transitionResult,
        };
      });

      const result = outerTx();

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
