import { Type, type Static } from '@sinclair/typebox';

export const VcsLabelSyncParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  labels: Type.Array(
    Type.Object({
      name: Type.String({ minLength: 1, maxLength: 50 }),
      color: Type.String({ pattern: '^[0-9a-fA-F]{6}$' }),
      description: Type.Optional(Type.String({ maxLength: 100 })),
    }),
    { minItems: 1, maxItems: 50 },
  ),
});

export type VcsLabelSyncParams = Static<typeof VcsLabelSyncParams>;
