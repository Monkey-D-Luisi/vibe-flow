import type { TaskStatus } from '../domain/task-status.js';
import type { GhClient } from './gh-client.js';
import type { EventLog } from '../orchestrator/event-log.js';
import type { LeaseManager } from '../orchestrator/lease-manager.js';
import type { TransitionDeps } from '../orchestrator/state-machine.js';
import type { SqliteOrchestratorRepository } from '../persistence/orchestrator-repository.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';

export type Logger = {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
};

export interface RecordValue {
  [key: string]: unknown;
}

export interface CiAutoTransitionConfig {
  readonly enabled: boolean;
  readonly toStatus: TaskStatus | null;
  readonly agentId: string;
}

export interface CiFeedbackConfig {
  readonly enabled: boolean;
  readonly routePath: string;
  readonly webhookSecret: string;
  readonly expectedRepository: string | null;
  readonly commentOnPr: boolean;
  readonly autoTransition: CiAutoTransitionConfig;
}

export interface CiFeedbackDeps {
  readonly taskRepo: SqliteTaskRepository;
  readonly orchestratorRepo: SqliteOrchestratorRepository;
  readonly leaseManager: LeaseManager;
  readonly requestRepo: SqliteRequestRepository;
  readonly eventLog: EventLog;
  readonly ghClient: GhClient;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly transitionDeps: TransitionDeps;
  readonly logger: Logger;
  readonly config: CiFeedbackConfig;
}

export interface CiWebhookInput {
  readonly eventName: string;
  readonly deliveryId: string | null;
  readonly payload: Record<string, unknown>;
}

export interface CiTransitionResult {
  readonly attempted: boolean;
  readonly transitioned: boolean;
  readonly toStatus?: TaskStatus;
  readonly reason?: string;
}

export interface CiWebhookResult {
  readonly handled: boolean;
  readonly cached: boolean;
  readonly taskId?: string;
  readonly commentPosted?: boolean;
  readonly transition?: CiTransitionResult;
  readonly reason?: string;
}
