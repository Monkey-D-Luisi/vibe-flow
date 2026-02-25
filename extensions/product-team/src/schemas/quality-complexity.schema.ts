import { Type, type Static } from '@sinclair/typebox';

export const QualityComplexityParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  globs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  exclude: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  engine: Type.Optional(
    Type.Union([
      Type.Literal('escomplex'),
      Type.Literal('tsmorph'),
    ]),
  ),
  workingDir: Type.Optional(Type.String({ minLength: 1 })),
});

export type QualityComplexityParams = Static<typeof QualityComplexityParams>;
