import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `escalation` messages. */
export const EscalationBody = Type.Object({
  _type: Type.Literal('escalation'),
  taskId: Type.Optional(Type.String({ description: 'Related task ID' })),
  reason: Type.String({ minLength: 1, description: 'Escalation reason' }),
  category: Type.String({ minLength: 1, description: 'Escalation category (blocker, dependency, quality, etc.)' }),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Additional context' })),
});
export type EscalationBody = Static<typeof EscalationBody>;
