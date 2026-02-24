import { Type, type Static } from '@sinclair/typebox';

export const TaskTransitionParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  toStatus: Type.Union([
    Type.Literal('backlog'),
    Type.Literal('grooming'),
    Type.Literal('design'),
    Type.Literal('in_progress'),
    Type.Literal('in_review'),
    Type.Literal('qa'),
    Type.Literal('done'),
  ]),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
});

export type TaskTransitionParams = Static<typeof TaskTransitionParams>;
