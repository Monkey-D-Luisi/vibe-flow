import type { EventLog } from '../orchestrator/event-log.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import { withIdempotency } from './idempotency.js';
import { GhClient } from './gh-client.js';
import { assertValidBranchName, buildTaskBranchName } from './validation.js';

export interface BranchServiceDeps {
  readonly ghClient: GhClient;
  readonly requestRepo: SqliteRequestRepository;
  readonly eventLog: EventLog;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly defaultBase: string;
}

export interface CreateTaskBranchInput {
  readonly taskId: string;
  readonly slug: string;
  readonly base?: string;
}

export interface CreateTaskBranchResult {
  readonly branch: string;
  readonly base: string;
  readonly sha: string;
  readonly created: boolean;
  readonly cached: boolean;
}

export class BranchService {
  constructor(private readonly deps: BranchServiceDeps) {}

  async createTaskBranch(input: CreateTaskBranchInput): Promise<CreateTaskBranchResult> {
    const branch = buildTaskBranchName(input.taskId, input.slug);
    const base = input.base ?? this.deps.defaultBase;
    assertValidBranchName(branch);

    const idempotent = await withIdempotency({
      taskId: input.taskId,
      tool: 'vcs.branch.create',
      payload: {
        taskId: input.taskId,
        branch,
        base,
      },
      deps: {
        requestRepo: this.deps.requestRepo,
        generateId: this.deps.generateId,
        now: this.deps.now,
      },
      execute: async () => {
        const baseSha = await this.deps.ghClient.getBranchSha(base);
        const created = await this.deps.ghClient.createBranch(branch, baseSha);
        return {
          branch,
          base,
          sha: created.sha,
        };
      },
    });

    const output: CreateTaskBranchResult = {
      branch: idempotent.result.branch,
      base: idempotent.result.base,
      sha: idempotent.result.sha,
      created: !idempotent.cached,
      cached: idempotent.cached,
    };

    this.deps.eventLog.logVcsEvent(input.taskId, 'vcs.branch.create', null, {
      ...output,
    });
    return output;
  }
}
