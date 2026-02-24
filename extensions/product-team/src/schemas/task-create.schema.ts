import { Type, type Static } from '@sinclair/typebox';

export const TaskCreateParams = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
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

export type TaskCreateParams = Static<typeof TaskCreateParams>;
