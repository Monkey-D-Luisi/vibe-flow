import { Type, type Static } from '@sinclair/typebox';

export const PipelineStartParams = Type.Object({
  ideaText: Type.String({ minLength: 1, maxLength: 5000, description: 'Product idea description' }),
  projectId: Type.Optional(Type.String({ description: 'Target project ID' })),
});
export type PipelineStartParams = Static<typeof PipelineStartParams>;

export const PipelineStatusParams = Type.Object({
  taskId: Type.Optional(Type.String({ description: 'Specific task ID to query, or all if omitted' })),
});
export type PipelineStatusParams = Static<typeof PipelineStatusParams>;

export const PipelineRetryParams = Type.Object({
  taskId: Type.String({ minLength: 1, description: 'Task ID to retry' }),
  stage: Type.Optional(Type.String({ description: 'Stage to retry (defaults to current)' })),
});
export type PipelineRetryParams = Static<typeof PipelineRetryParams>;

export const PipelineSkipParams = Type.Object({
  taskId: Type.String({ minLength: 1, description: 'Task ID to skip stage for' }),
  stage: Type.String({ minLength: 1, description: 'Stage to skip' }),
  reason: Type.String({ minLength: 1, maxLength: 500, description: 'Reason for skipping' }),
});
export type PipelineSkipParams = Static<typeof PipelineSkipParams>;
