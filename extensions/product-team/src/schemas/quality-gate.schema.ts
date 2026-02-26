import { Type, type Static } from '@sinclair/typebox';

const ScopeSchema = Type.Union([
  Type.Literal('major'),
  Type.Literal('minor'),
  Type.Literal('patch'),
]);

const QualityGateAutoTuneBoundsSchema = Type.Object(
  {
    min: Type.Number({ minimum: 0 }),
    max: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const QualityGateAutoTuneMaxDeltasSchema = Type.Object(
  {
    coverageMinPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    lintMaxWarnings: Type.Optional(Type.Number({ minimum: 0 })),
    complexityMaxCyclomatic: Type.Optional(Type.Number({ minimum: 0 })),
  },
  { additionalProperties: false },
);

const QualityGateAutoTuneBoundsMapSchema = Type.Object(
  {
    coverageMinPct: Type.Optional(QualityGateAutoTuneBoundsSchema),
    lintMaxWarnings: Type.Optional(QualityGateAutoTuneBoundsSchema),
    complexityMaxCyclomatic: Type.Optional(QualityGateAutoTuneBoundsSchema),
  },
  { additionalProperties: false },
);

export const QualityGateAutoTune = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean()),
    historyWindow: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    minSamples: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    smoothingFactor: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    maxDeltas: Type.Optional(QualityGateAutoTuneMaxDeltasSchema),
    bounds: Type.Optional(QualityGateAutoTuneBoundsMapSchema),
  },
  { additionalProperties: false },
);

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
  autoTune: Type.Optional(QualityGateAutoTune),
});

export type QualityGateParams = Static<typeof QualityGateParams>;
export type QualityGatePolicyOverrides = Static<typeof QualityGatePolicyOverrides>;
export type QualityGateAutoTune = Static<typeof QualityGateAutoTune>;
