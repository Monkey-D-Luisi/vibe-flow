import { TaskNotFoundError } from '../domain/errors.js';
import { VcsBranchCreateParams } from '../schemas/vcs-branch-create.schema.js';
import type { ToolDef, ToolDeps } from './index.js';
import { rethrowVcsError } from './vcs-errors.js';

function assertVcsDeps(deps: ToolDeps): asserts deps is ToolDeps & {
  vcs: NonNullable<ToolDeps['vcs']>;
} {
  if (!deps.vcs?.branchService) {
    throw new Error('vcs dependencies are not configured');
  }
}

export function vcsBranchCreateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'vcs.branch.create',
    label: 'Create Task Branch',
    description: 'Create a Git branch for a task using gh CLI (idempotent)',
    parameters: VcsBranchCreateParams,
    execute: async (_toolCallId, params) => {
      assertVcsDeps(deps);
      const input = deps.validate<{
        taskId: string;
        slug: string;
        base?: string;
      }>(VcsBranchCreateParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        throw new TaskNotFoundError(input.taskId);
      }

      try {
        const result = await deps.vcs.branchService.createTaskBranch({
          taskId: input.taskId,
          slug: input.slug,
          base: input.base,
        });

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
