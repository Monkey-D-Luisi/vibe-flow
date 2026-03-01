import type { TaskRecord } from '../domain/task-record.js';

export interface PrBotAfterToolCallEvent {
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: string;
}

export interface PrBotHookContext {
  readonly toolName: string;
  readonly agentId?: string;
  readonly sessionKey?: string;
}

export interface LabelInput {
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

export interface PrBotTaskReader {
  getById(taskId: string): TaskRecord | null;
}

export interface PrBotLabelService {
  syncLabels(input: { taskId: string; labels: LabelInput[] }): Promise<unknown>;
}

export interface PrBotPrService {
  updateTaskPr(input: {
    taskId: string;
    prNumber: number;
    labels?: string[];
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
  }): Promise<unknown>;
}

export interface PrBotGhClient {
  requestReviewers(prNumber: number, reviewers: string[]): Promise<void>;
  commentPr(prNumber: number, body: string): Promise<void>;
}

export interface PrBotEventLog {
  logVcsEvent(
    taskId: string,
    eventType: `vcs.${string}`,
    agentId: string | null,
    payload: Record<string, unknown>,
  ): unknown;
}

export interface PrBotLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface PrBotReviewerConfig {
  readonly default: readonly string[];
  readonly major: readonly string[];
  readonly minor: readonly string[];
  readonly patch: readonly string[];
}

export interface PrBotConfig {
  readonly enabled: boolean;
  readonly reviewers: PrBotReviewerConfig;
}

export interface PrBotAutomationDeps {
  readonly taskReader: PrBotTaskReader;
  readonly labelService: PrBotLabelService;
  readonly prService: PrBotPrService;
  readonly ghClient: PrBotGhClient;
  readonly eventLog: PrBotEventLog;
  readonly logger: PrBotLogger;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly defaultBase: string;
  readonly config: PrBotConfig;
}

export interface PrCreateResult {
  readonly prNumber: number;
  readonly cached: boolean;
  readonly url?: string;
}

export interface PrBotExecutionSummary {
  prNumber: number;
  cached: boolean;
  labelsApplied: string[];
  reviewersAssigned: string[];
  commentPosted: boolean;
  failures: string[];
  taskLink?: string;
}
