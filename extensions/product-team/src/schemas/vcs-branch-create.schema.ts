import { Type, type Static } from '@sinclair/typebox';

export const VcsBranchCreateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  slug: Type.String({
    minLength: 1,
    maxLength: 80,
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
  }),
  base: Type.Optional(Type.String({ minLength: 1 })),
});

export type VcsBranchCreateParams = Static<typeof VcsBranchCreateParams>;
