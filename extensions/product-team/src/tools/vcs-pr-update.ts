import { TaskNotFoundError } from '../domain/errors.js';
import { VcsPrUpdateParams } from '../schemas/vcs-pr-update.schema.js';
import type { ToolDef, ToolDeps } from './index.js';
import { rethrowVcsError } from './vcs-errors.js';

function assertVcsDeps(deps: ToolDeps): asserts deps is ToolDeps & {
  vcs: NonNullable<ToolDeps['vcs']>;
} {
  if (!deps.vcs?.prService) {
    throw new Error('vcs dependencies are not configured');
  }
}

export function vcsPrUpdateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'vcs.pr.update',
    label: 'Update Pull Request',
    description: 'Update PR metadata and state using gh CLI (idempotent)',
    parameters: VcsPrUpdateParams,
    execute: async (_toolCallId, params) => {
      assertVcsDeps(deps);
      const input = deps.validate<{
        taskId: string;
        prNumber: number;
        title?: string;
        body?: string;
        labels?: string[];
        state?: 'open' | 'closed';
      }>(VcsPrUpdateParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        throw new TaskNotFoundError(input.taskId);
      }

      try {
        const result = await deps.vcs.prService.updateTaskPr(input);
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
