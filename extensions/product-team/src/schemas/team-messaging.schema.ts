import { Type, type Static } from '@sinclair/typebox';

export const TeamMessageParams = Type.Object({
  to: Type.String({ minLength: 1, description: 'Target agent ID' }),
  subject: Type.String({ minLength: 1, maxLength: 200, description: 'Message subject' }),
  body: Type.String({ minLength: 1, maxLength: 2000, description: 'Message body' }),
  priority: Type.Optional(Type.Union([
    Type.Literal('low'),
    Type.Literal('normal'),
    Type.Literal('urgent'),
  ])),
  taskRef: Type.Optional(Type.String({ description: 'Related task ID' })),
  from: Type.Optional(Type.String({ minLength: 1, description: 'Sender agent ID' })),
});
export type TeamMessageParams = Static<typeof TeamMessageParams>;

export const TeamInboxParams = Type.Object({
  agentId: Type.String({ minLength: 1, description: 'Agent ID whose inbox to read' }),
  unreadOnly: Type.Optional(Type.Boolean({ description: 'Only return unread messages' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: 'Max messages to return' })),
});
export type TeamInboxParams = Static<typeof TeamInboxParams>;

export const TeamReplyParams = Type.Object({
  messageId: Type.String({ minLength: 1, description: 'ID of the message to reply to' }),
  body: Type.String({ minLength: 1, maxLength: 2000, description: 'Reply body' }),
});
export type TeamReplyParams = Static<typeof TeamReplyParams>;

export const TeamStatusParams = Type.Object({});
export type TeamStatusParams = Static<typeof TeamStatusParams>;

export const TeamAssignParams = Type.Object({
  taskId: Type.String({ minLength: 1, description: 'Task to assign' }),
  agentId: Type.String({ minLength: 1, description: 'Agent to assign to' }),
  message: Type.Optional(Type.String({ maxLength: 500, description: 'Assignment message' })),
  fromAgent: Type.Optional(Type.String({ minLength: 1, description: 'Agent performing the assignment' })),
});
export type TeamAssignParams = Static<typeof TeamAssignParams>;
