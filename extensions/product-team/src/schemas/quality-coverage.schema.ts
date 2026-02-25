import { Type, type Static } from '@sinclair/typebox';

export const QualityCoverageParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  summaryPath: Type.Optional(Type.String({ minLength: 1 })),
  lcovPath: Type.Optional(Type.String({ minLength: 1 })),
  workingDir: Type.Optional(Type.String({ minLength: 1 })),
  format: Type.Optional(
    Type.Union([
      Type.Literal('summary'),
      Type.Literal('lcov'),
      Type.Literal('auto'),
    ]),
  ),
  exclude: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});

export type QualityCoverageParams = Static<typeof QualityCoverageParams>;
