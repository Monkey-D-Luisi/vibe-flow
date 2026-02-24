import { Type, type Static } from '@sinclair/typebox';

export const VcsPrCreateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1, maxLength: 256 }),
  body: Type.Optional(Type.String({ maxLength: 65_536 })),
  labels: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 })),
  base: Type.Optional(Type.String({ minLength: 1 })),
  head: Type.Optional(Type.String({ minLength: 1 })),
  draft: Type.Optional(Type.Boolean()),
});

export type VcsPrCreateParams = Static<typeof VcsPrCreateParams>;
