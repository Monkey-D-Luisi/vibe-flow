import { TaskNotFoundError } from '../domain/errors.js';
import { buildDefaultPrBody } from '../github/pr-template.js';
import { VcsPrCreateParams } from '../schemas/vcs-pr-create.schema.js';
import type { ToolDef, ToolDeps } from './index.js';
import { rethrowVcsError } from './vcs-errors.js';

function assertVcsDeps(deps: ToolDeps): asserts deps is ToolDeps & {
  vcs: NonNullable<ToolDeps['vcs']>;
} {
  if (!deps.vcs?.prService) {
    throw new Error('vcs dependencies are not configured');
  }
}

export function vcsPrCreateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'vcs.pr.create',
    label: 'Create Pull Request',
    description: 'Create a pull request for a task using gh CLI (idempotent)',
    parameters: VcsPrCreateParams,
    execute: async (_toolCallId, params) => {
      assertVcsDeps(deps);
      const input = deps.validate<{
        taskId: string;
        title: string;
        body?: string;
        labels?: string[];
        base?: string;
        head?: string;
        draft?: boolean;
      }>(VcsPrCreateParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        throw new TaskNotFoundError(input.taskId);
      }

      const body = input.body ?? buildDefaultPrBody(task);

      try {
        const pr = await deps.vcs.prService.createTaskPr({
          taskId: input.taskId,
          title: input.title,
          body,
          labels: input.labels,
          base: input.base,
          head: input.head,
          draft: input.draft,
        });

        const result = {
          ...pr,
          bodyGenerated: input.body === undefined,
        };

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
