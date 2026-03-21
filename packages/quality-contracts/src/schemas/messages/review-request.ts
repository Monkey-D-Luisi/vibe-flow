import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `review_request` messages. */
export const ReviewRequestBody = Type.Object({
  _type: Type.Literal('review_request'),
  taskId: Type.String({ minLength: 1, description: 'Task under review' }),
  prUrl: Type.Optional(Type.String({ description: 'Pull request URL' })),
  changedFiles: Type.Optional(Type.Array(Type.String(), { description: 'Files changed in the PR' })),
  qualityReport: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Quality gate results' })),
});
export type ReviewRequestBody = Static<typeof ReviewRequestBody>;
