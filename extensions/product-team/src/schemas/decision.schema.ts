import { Type, type Static } from '@sinclair/typebox';

export const DecisionEvaluateParams = Type.Object({
  category: Type.Union([
    Type.Literal('technical'),
    Type.Literal('scope'),
    Type.Literal('quality'),
    Type.Literal('conflict'),
    Type.Literal('budget'),
    Type.Literal('blocker'),
  ], { description: 'Decision category' }),
  question: Type.String({ minLength: 1, maxLength: 1000, description: 'The question to decide' }),
  options: Type.Array(Type.Object({
    id: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    pros: Type.Optional(Type.String()),
    cons: Type.Optional(Type.String()),
  }), { minItems: 2, maxItems: 10, description: 'Available options' }),
  recommendation: Type.Optional(Type.String({ description: 'Agent recommended option ID' })),
  reasoning: Type.Optional(Type.String({ description: 'Agent reasoning for recommendation' })),
  taskRef: Type.Optional(Type.String({ description: 'Related task ID' })),
});
export type DecisionEvaluateParams = Static<typeof DecisionEvaluateParams>;

export const DecisionLogParams = Type.Object({
  taskRef: Type.String({ minLength: 1, description: 'Task ID to query decisions for' }),
});
export type DecisionLogParams = Static<typeof DecisionLogParams>;
