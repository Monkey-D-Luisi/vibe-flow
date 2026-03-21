import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `review_result` messages. */
export const ReviewResultBody = Type.Object({
  _type: Type.Literal('review_result'),
  taskId: Type.String({ minLength: 1, description: 'Task reviewed' }),
  verdict: Type.Union([
    Type.Literal('approved'),
    Type.Literal('changes_requested'),
    Type.Literal('rejected'),
  ], { description: 'Review verdict' }),
  violations: Type.Optional(Type.Array(Type.Object({
    file: Type.String(),
    line: Type.Optional(Type.Number()),
    message: Type.String(),
    severity: Type.Optional(Type.Union([Type.Literal('error'), Type.Literal('warning'), Type.Literal('info')])),
  }), { description: 'Code violations found' })),
  summary: Type.Optional(Type.String({ description: 'Review summary' })),
});
export type ReviewResultBody = Static<typeof ReviewResultBody>;
