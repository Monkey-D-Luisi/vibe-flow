import { Type, type Static } from '@sinclair/typebox';

/** Body schema for `design_delivery` messages. */
export const DesignDeliveryBody = Type.Object({
  _type: Type.Literal('design_delivery'),
  taskId: Type.String({ minLength: 1, description: 'Task the design is for' }),
  screenIds: Type.Optional(Type.Array(Type.String(), { description: 'Stitch screen IDs' })),
  htmlPaths: Type.Optional(Type.Array(Type.String(), { description: 'Paths to generated HTML files' })),
});
export type DesignDeliveryBody = Static<typeof DesignDeliveryBody>;
