import { TaskNotFoundError } from '../domain/errors.js';
import { VcsLabelSyncParams } from '../schemas/vcs-label-sync.schema.js';
import type { ToolDef, ToolDeps } from './index.js';
import { rethrowVcsError } from './vcs-errors.js';

function assertVcsDeps(deps: ToolDeps): asserts deps is ToolDeps & {
  vcs: NonNullable<ToolDeps['vcs']>;
} {
  if (!deps.vcs?.labelService) {
    throw new Error('vcs dependencies are not configured');
  }
}

export function vcsLabelSyncToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'vcs.label.sync',
    label: 'Sync Repository Labels',
    description: 'Create/update GitHub labels using gh CLI (idempotent)',
    parameters: VcsLabelSyncParams,
    execute: async (_toolCallId, params) => {
      assertVcsDeps(deps);
      const input = deps.validate<{
        taskId: string;
        labels: Array<{ name: string; color: string; description?: string }>;
      }>(VcsLabelSyncParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        throw new TaskNotFoundError(input.taskId);
      }

      try {
        const result = await deps.vcs.labelService.syncLabels(input);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      } catch (error: unknown) {
        rethrowVcsError(error);
      }
    },
  };
}
