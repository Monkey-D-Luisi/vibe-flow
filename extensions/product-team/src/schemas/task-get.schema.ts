import { Type, type Static } from '@sinclair/typebox';

export const TaskGetParams = Type.Object({
  id: Type.String({ minLength: 1 }),
});

export type TaskGetParams = Static<typeof TaskGetParams>;
