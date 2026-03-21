import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `stage_handoff` messages. */
export const StageHandoffBody = Type.Object({
  _type: Type.Literal('stage_handoff'),
  taskId: Type.String({ minLength: 1, description: 'Task being handed off' }),
  fromStage: Type.String({ minLength: 1, description: 'Source pipeline stage' }),
  toStage: Type.String({ minLength: 1, description: 'Target pipeline stage' }),
  artifacts: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Stage outputs' })),
});
export type StageHandoffBody = Static<typeof StageHandoffBody>;
