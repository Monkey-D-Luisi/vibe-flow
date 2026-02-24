import type { EventLog } from '../orchestrator/event-log.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import { withIdempotency } from './idempotency.js';
import type { GhPullRequestSummary } from './gh-client.js';
import { GhClient } from './gh-client.js';
import { assertValidLabelName, assertValidPrTitle } from './validation.js';

export interface PrServiceDeps {
  readonly ghClient: GhClient;
  readonly requestRepo: SqliteRequestRepository;
  readonly eventLog: EventLog;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly defaultBase: string;
}

export interface CreateTaskPrInput {
  readonly taskId: string;
  readonly title: string;
  readonly body: string;
  readonly labels?: string[];
  readonly base?: string;
  readonly head?: string;
  readonly draft?: boolean;
}

export interface CreateTaskPrResult {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly head: string;
  readonly base: string;
  readonly cached: boolean;
}

export interface UpdateTaskPrInput {
  readonly taskId: string;
  readonly prNumber: number;
  readonly title?: string;
  readonly body?: string;
  readonly labels?: string[];
  readonly state?: 'open' | 'closed';
}

export interface UpdateTaskPrResult {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state?: string;
  readonly cached: boolean;
}

function parseCachedBranch(response: string, taskId: string): string {
  const parsed = JSON.parse(response) as { branch?: unknown };
  if (typeof parsed.branch !== 'string' || parsed.branch.length === 0) {
    throw new Error(`Task ${taskId} has an invalid cached branch response`);
  }
  return parsed.branch;
}

function assertLabels(labels: string[]): void {
  for (const label of labels) {
    assertValidLabelName(label);
  }
}

function assertUpdateInput(input: UpdateTaskPrInput): void {
  if (
    input.title === undefined &&
    input.body === undefined &&
    input.labels === undefined &&
    input.state === undefined
  ) {
    throw new Error('vcs.pr.update requires at least one field to update');
  }
}

export class PrService {
  constructor(private readonly deps: PrServiceDeps) {}

  private resolveHeadBranch(taskId: string, head?: string): string {
    if (head && head.length > 0) {
      return head;
    }
    const latestBranch = this.deps.requestRepo.findLatestByTaskAndTool(taskId, 'vcs.branch.create');
    if (!latestBranch) {
      throw new Error(
        `No cached branch found for task ${taskId}; run vcs.branch.create first or provide head`,
      );
    }
    return parseCachedBranch(latestBranch.response, taskId);
  }

  async createTaskPr(input: CreateTaskPrInput): Promise<CreateTaskPrResult> {
    assertValidPrTitle(input.title);
    const labels = input.labels ?? [];
    assertLabels(labels);

    const base = input.base ?? this.deps.defaultBase;
    const head = this.resolveHeadBranch(input.taskId, input.head);
    const draft = input.draft ?? false;

    const idempotent = await withIdempotency<GhPullRequestSummary>({
      taskId: input.taskId,
      tool: 'vcs.pr.create',
      payload: {
        taskId: input.taskId,
        head,
        base,
        title: input.title,
        body: input.body,
        labels,
        draft,
      },
      deps: {
        requestRepo: this.deps.requestRepo,
        generateId: this.deps.generateId,
        now: this.deps.now,
      },
      execute: () =>
        this.deps.ghClient.createPr({
          head,
          base,
          title: input.title,
          body: input.body,
          labels,
          draft,
        }),
    });

    const output: CreateTaskPrResult = {
      number: idempotent.result.number,
      url: idempotent.result.url,
      title: idempotent.result.title,
      head,
      base,
      cached: idempotent.cached,
    };

    this.deps.eventLog.logVcsEvent(input.taskId, 'vcs.pr.create', null, {
      ...output,
    });
    return output;
  }

  async updateTaskPr(input: UpdateTaskPrInput): Promise<UpdateTaskPrResult> {
    assertUpdateInput(input);
    if (input.title !== undefined) {
      assertValidPrTitle(input.title);
    }
    assertLabels(input.labels ?? []);

    const idempotent = await withIdempotency<GhPullRequestSummary>({
      taskId: input.taskId,
      tool: 'vcs.pr.update',
      payload: {
        taskId: input.taskId,
        prNumber: input.prNumber,
        title: input.title ?? null,
        body: input.body ?? null,
        labels: input.labels ?? [],
        state: input.state ?? null,
      },
      deps: {
        requestRepo: this.deps.requestRepo,
        generateId: this.deps.generateId,
        now: this.deps.now,
      },
      execute: () =>
        this.deps.ghClient.updatePr({
          number: input.prNumber,
          title: input.title,
          body: input.body,
          labels: input.labels,
          state: input.state,
        }),
    });

    const output: UpdateTaskPrResult = {
      number: idempotent.result.number,
      url: idempotent.result.url,
      title: idempotent.result.title,
      state: idempotent.result.state,
      cached: idempotent.cached,
    };

    this.deps.eventLog.logVcsEvent(input.taskId, 'vcs.pr.update', null, {
      ...output,
    });
    return output;
  }
}
