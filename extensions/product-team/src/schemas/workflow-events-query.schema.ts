import { Type, type Static } from '@sinclair/typebox';

export const WorkflowEventsQueryParams = Type.Object({
  taskId: Type.Optional(Type.String({ minLength: 1 })),
  agentId: Type.Optional(Type.String({ minLength: 1 })),
  eventType: Type.Optional(Type.String({ minLength: 1 })),
  since: Type.Optional(Type.String({ format: 'date-time' })),
  until: Type.Optional(Type.String({ format: 'date-time' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

export type WorkflowEventsQueryParams = Static<typeof WorkflowEventsQueryParams>;
