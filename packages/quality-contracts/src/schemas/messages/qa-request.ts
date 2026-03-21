import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `qa_request` messages. */
export const QaRequestBody = Type.Object({
  _type: Type.Literal('qa_request'),
  taskId: Type.String({ minLength: 1, description: 'Task to test' }),
  scope: Type.Optional(Type.String({ description: 'Test scope (unit, integration, e2e)' })),
  testTargets: Type.Optional(Type.Array(Type.String(), { description: 'Specific files or modules to test' })),
});
export type QaRequestBody = Static<typeof QaRequestBody>;
