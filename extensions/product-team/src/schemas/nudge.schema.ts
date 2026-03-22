import { Type, type Static } from '@sinclair/typebox';

export const NudgeToolParams = Type.Object({
  scope: Type.Optional(
    Type.Union([
      Type.Literal('all'),
      Type.Literal('blocked'),
      Type.Literal('active'),
    ], { description: 'Which agents/tasks to nudge (default: all)' }),
  ),
  agentIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: 'Specific agent IDs to nudge (overrides scope for agent selection)',
    }),
  ),
  dryRun: Type.Optional(
    Type.Boolean({ description: 'When true, compute the report without sending messages' }),
  ),
  staleThresholdMs: Type.Optional(
    Type.Number({
      minimum: 0,
      description: 'Override default stale threshold in milliseconds (default: 1800000 = 30 min)',
    }),
  ),
});
export type NudgeToolParams = Static<typeof NudgeToolParams>;

export const NudgedAgentEntry = Type.Object({
  agentId: Type.String(),
  status: Type.Union([Type.Literal('nudged'), Type.Literal('skipped'), Type.Literal('dry-run')]),
  currentFocus: Type.Union([Type.String(), Type.Null()]),
  message: Type.String(),
});
export type NudgedAgentEntry = Static<typeof NudgedAgentEntry>;

export const BlockedTaskEntry = Type.Object({
  taskId: Type.String(),
  stage: Type.String(),
  staleDurationMs: Type.Number(),
  proposedAction: Type.Union([
    Type.Literal('retry'),
    Type.Literal('escalate'),
    Type.Literal('skip'),
  ]),
});
export type BlockedTaskEntry = Static<typeof BlockedTaskEntry>;

export const NudgeReport = Type.Object({
  nudgedAgents: Type.Array(NudgedAgentEntry),
  blockedTasks: Type.Array(BlockedTaskEntry),
  timestamp: Type.String(),
  dryRun: Type.Boolean(),
});
export type NudgeReport = Static<typeof NudgeReport>;
