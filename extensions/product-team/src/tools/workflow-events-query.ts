import type { ToolDef, ToolDeps } from './index.js';
import {
  WorkflowEventsQueryParams,
  type WorkflowEventsQueryParams as WorkflowEventsQueryParamsType,
} from '../schemas/workflow-events-query.schema.js';

export function workflowEventsQueryToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'workflow.events.query',
    label: 'Query Workflow Events',
    description: 'Query paginated workflow events with filters and aggregates',
    parameters: WorkflowEventsQueryParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<WorkflowEventsQueryParamsType>(WorkflowEventsQueryParams, params);
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const result = deps.eventLog.queryEvents({
        taskId: input.taskId,
        agentId: input.agentId,
        eventType: input.eventType,
        since: input.since,
        until: input.until,
        limit,
        offset,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
