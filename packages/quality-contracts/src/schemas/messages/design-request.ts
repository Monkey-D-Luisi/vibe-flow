import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `design_request` messages. */
export const DesignRequestBody = Type.Object({
  _type: Type.Literal('design_request'),
  taskId: Type.String({ minLength: 1, description: 'Task requiring design' }),
  brief: Type.String({ minLength: 1, description: 'Design brief from PO' }),
  constraints: Type.Optional(Type.Array(Type.String(), { description: 'Design constraints' })),
});
export type DesignRequestBody = Static<typeof DesignRequestBody>;
