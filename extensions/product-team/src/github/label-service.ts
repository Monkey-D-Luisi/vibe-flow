import type { EventLog } from '../orchestrator/event-log.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import { withIdempotency } from './idempotency.js';
import { GhClient } from './gh-client.js';
import { assertValidLabelColor, assertValidLabelName } from './validation.js';

export interface LabelInput {
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

export interface LabelServiceDeps {
  readonly ghClient: GhClient;
  readonly requestRepo: SqliteRequestRepository;
  readonly eventLog: EventLog;
  readonly generateId: () => string;
  readonly now: () => string;
}

export interface SyncLabelsInput {
  readonly taskId: string;
  readonly labels: LabelInput[];
}

export interface SyncLabelsResult {
  readonly synced: number;
  readonly labels: string[];
  readonly cached: boolean;
}

function normalizeLabels(labels: LabelInput[]): LabelInput[] {
  const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((label) => ({
    name: label.name,
    color: label.color.toLowerCase(),
    description: label.description ?? '',
  }));
}

function validateLabels(labels: LabelInput[]): void {
  for (const label of labels) {
    assertValidLabelName(label.name);
    assertValidLabelColor(label.color);
  }
}

export class LabelService {
  constructor(private readonly deps: LabelServiceDeps) {}

  async syncLabels(input: SyncLabelsInput): Promise<SyncLabelsResult> {
    validateLabels(input.labels);
    const normalized = normalizeLabels(input.labels);

    const idempotent = await withIdempotency({
      taskId: input.taskId,
      tool: 'vcs.label.sync',
      payload: {
        taskId: input.taskId,
        labels: normalized,
      },
      deps: {
        requestRepo: this.deps.requestRepo,
        generateId: this.deps.generateId,
        now: this.deps.now,
      },
      execute: async () => {
        for (const label of normalized) {
          await this.deps.ghClient.syncLabel(
            label.name,
            label.color,
            label.description ?? '',
          );
        }
        return {
          synced: normalized.length,
          labels: normalized.map((item) => item.name),
        };
      },
    });

    const output: SyncLabelsResult = {
      synced: idempotent.result.synced,
      labels: idempotent.result.labels,
      cached: idempotent.cached,
    };

    this.deps.eventLog.logVcsEvent(input.taskId, 'vcs.label.sync', null, {
      ...output,
    });
    return output;
  }
}
