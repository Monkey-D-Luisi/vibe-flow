import { Type, type Static } from '@sinclair/typebox';

const ScopeSchema = Type.Union([
  Type.Literal('major'),
  Type.Literal('minor'),
  Type.Literal('patch'),
]);

export const QualityGatePolicyOverrides = Type.Object(
  {
    coverageMinPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    lintMaxErrors: Type.Optional(Type.Integer({ minimum: 0 })),
    lintMaxWarnings: Type.Optional(Type.Integer({ minimum: 0 })),
    complexityMaxCyclomatic: Type.Optional(Type.Number({ minimum: 0 })),
    testsRequired: Type.Optional(Type.Boolean()),
    testsMustPass: Type.Optional(Type.Boolean()),
    rgrMaxCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const QualityGateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  scope: Type.Optional(ScopeSchema),
  policy: Type.Optional(QualityGatePolicyOverrides),
});

export type QualityGateParams = Static<typeof QualityGateParams>;
export type QualityGatePolicyOverrides = Static<typeof QualityGatePolicyOverrides>;
