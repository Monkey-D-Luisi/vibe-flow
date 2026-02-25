import { Type, type Static } from '@sinclair/typebox';

export const QualityTestsParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  command: Type.Optional(Type.String({ minLength: 1 })),
  workingDir: Type.Optional(Type.String({ minLength: 1 })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000 })),
});

export type QualityTestsParams = Static<typeof QualityTestsParams>;
