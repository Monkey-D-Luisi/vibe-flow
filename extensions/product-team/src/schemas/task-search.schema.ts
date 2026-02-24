import { Type, type Static } from '@sinclair/typebox';

export const TaskSearchParams = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal('backlog'),
      Type.Literal('grooming'),
      Type.Literal('design'),
      Type.Literal('in_progress'),
      Type.Literal('in_review'),
      Type.Literal('qa'),
      Type.Literal('done'),
    ]),
  ),
  assignee: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

export type TaskSearchParams = Static<typeof TaskSearchParams>;
