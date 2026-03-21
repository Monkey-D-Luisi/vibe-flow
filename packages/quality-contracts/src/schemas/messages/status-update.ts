import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `status_update` messages. */
export const StatusUpdateBody = Type.Object({
  _type: Type.Literal('status_update'),
  agentId: Type.String({ minLength: 1, description: 'Agent reporting status' }),
  status: Type.Union([
    Type.Literal('idle'),
    Type.Literal('working'),
    Type.Literal('blocked'),
    Type.Literal('error'),
  ], { description: 'Current agent status' }),
  currentTask: Type.Optional(Type.String({ description: 'Task the agent is working on' })),
  progress: Type.Optional(Type.String({ description: 'Progress description' })),
});
export type StatusUpdateBody = Static<typeof StatusUpdateBody>;
