import { Type, type Static } from '@sinclair/typebox';

export const WorkflowStateGetParams = Type.Object({
  id: Type.String({ minLength: 1 }),
});

export type WorkflowStateGetParams = Static<typeof WorkflowStateGetParams>;
