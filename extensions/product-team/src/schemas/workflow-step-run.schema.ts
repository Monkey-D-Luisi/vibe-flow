import { Type, type Static } from '@sinclair/typebox';
import { ALL_STATUSES } from '../domain/task-status.js';
import { ROLE_SCHEMA_KEYS } from './workflow-role.schema.js';

const TaskStatusUnion = Type.Union(
  ALL_STATUSES.map((status) => Type.Literal(status)),
);

const RoleSchemaKeyUnion = Type.Union(
  ROLE_SCHEMA_KEYS.map((schemaKey) => Type.Literal(schemaKey)),
);

const RoleUnion = Type.Union([
  Type.Literal('pm'),
  Type.Literal('architect'),
  Type.Literal('dev'),
  Type.Literal('qa'),
  Type.Literal('reviewer'),
]);

const LlmTaskStepSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.Literal('llm-task'),
  role: RoleUnion,
  schemaKey: RoleSchemaKeyUnion,
  output: Type.Record(Type.String(), Type.Unknown()),
});

const ShellStepSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.Literal('shell'),
  command: Type.String({ minLength: 1 }),
  output: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

const ScriptStepSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.Literal('script'),
  script: Type.String({ minLength: 1 }),
  output: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const WorkflowStepSchema = Type.Union([
  LlmTaskStepSchema,
  ShellStepSchema,
  ScriptStepSchema,
]);

export const WorkflowStepRunParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  steps: Type.Array(WorkflowStepSchema, { minItems: 1 }),
  toStatus: Type.Optional(TaskStatusUnion),
  orchestratorRev: Type.Optional(Type.Integer({ minimum: 0 })),
});

export type WorkflowStep = Static<typeof WorkflowStepSchema>;
export type WorkflowStepRunParams = Static<typeof WorkflowStepRunParams>;
