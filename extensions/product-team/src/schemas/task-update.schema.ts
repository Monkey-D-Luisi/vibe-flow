import { Type, type Static } from '@sinclair/typebox';

export const TaskUpdateParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  scope: Type.Optional(
    Type.Union([
      Type.Literal('major'),
      Type.Literal('minor'),
      Type.Literal('patch'),
    ]),
  ),
  assignee: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tags: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type TaskUpdateParams = Static<typeof TaskUpdateParams>;
