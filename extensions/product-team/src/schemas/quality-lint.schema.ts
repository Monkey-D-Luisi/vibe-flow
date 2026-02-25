import { Type, type Static } from '@sinclair/typebox';

export const QualityLintParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  engine: Type.Optional(
    Type.Union([
      Type.Literal('eslint'),
      Type.Literal('ruff'),
    ]),
  ),
  command: Type.Optional(Type.String({ minLength: 1 })),
  paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  workingDir: Type.Optional(Type.String({ minLength: 1 })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000 })),
});

export type QualityLintParams = Static<typeof QualityLintParams>;
