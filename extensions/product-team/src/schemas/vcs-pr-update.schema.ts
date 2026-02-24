import { Type, type Static } from '@sinclair/typebox';

export const VcsPrUpdateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  prNumber: Type.Integer({ minimum: 1 }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  body: Type.Optional(Type.String({ maxLength: 65_536 })),
  labels: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 20 })),
  state: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('closed')])),
});

export type VcsPrUpdateParams = Static<typeof VcsPrUpdateParams>;
