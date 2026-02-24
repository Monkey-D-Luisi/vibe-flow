import { Type, type Static } from '@sinclair/typebox';
import { ALL_STATUSES } from '../domain/task-status.js';

const TaskStatusUnion = Type.Union(
  ALL_STATUSES.map((s) => Type.Literal(s)),
);

export const TaskSearchParams = Type.Object({
  status: Type.Optional(TaskStatusUnion),
  assignee: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

export type TaskSearchParams = Static<typeof TaskSearchParams>;
