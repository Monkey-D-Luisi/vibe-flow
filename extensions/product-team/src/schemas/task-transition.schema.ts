import { Type, type Static } from '@sinclair/typebox';
import { ALL_STATUSES } from '../domain/task-status.js';

const TaskStatusUnion = Type.Union(
  ALL_STATUSES.map((s) => Type.Literal(s)),
);

export const TaskTransitionParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  toStatus: TaskStatusUnion,
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
});

export type TaskTransitionParams = Static<typeof TaskTransitionParams>;
