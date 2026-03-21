import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `budget_alert` messages. */
export const BudgetAlertBody = Type.Object({
  _type: Type.Literal('budget_alert'),
  scope: Type.String({ minLength: 1, description: 'Budget scope (pipeline, agent)' }),
  consumed: Type.Number({ minimum: 0, description: 'Consumed budget (tokens or USD)' }),
  limit: Type.Number({ minimum: 0, description: 'Budget limit (tokens or USD)' }),
  recommendation: Type.Optional(Type.String({ description: 'Recommended action' })),
});
export type BudgetAlertBody = Static<typeof BudgetAlertBody>;
