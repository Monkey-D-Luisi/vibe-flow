import type Database from 'better-sqlite3';
import type { TSchema } from '@sinclair/typebox';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import type { SqliteOrchestratorRepository } from '../persistence/orchestrator-repository.js';
import type { SqliteLeaseRepository } from '../persistence/lease-repository.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import type { EventLog } from '../orchestrator/event-log.js';
import type { ValidateFn } from '../schemas/validator.js';
import type { TransitionGuardConfig } from '../orchestrator/transition-guards.js';
import type { BranchService } from '../github/branch-service.js';
import type { PrService } from '../github/pr-service.js';
import type { LabelService } from '../github/label-service.js';

interface ToolLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
  readonly debug?: (message: string) => void;
}

export interface ToolDeps {
  db: Database.Database;
  taskRepo: SqliteTaskRepository;
  orchestratorRepo: SqliteOrchestratorRepository;
  leaseRepo: SqliteLeaseRepository;
  eventLog: EventLog;
  generateId: () => string;
  now: () => string;
  validate: ValidateFn;
  transitionGuardConfig: TransitionGuardConfig;
  concurrencyConfig?: {
    readonly maxLeasesPerAgent?: number;
    readonly maxTotalLeases?: number;
  };
  logger?: ToolLogger;
  workspaceDir?: string;
  projectConfig?: {
    projects?: Array<Record<string, unknown>>;
    activeProject?: string;
  };
  agentConfig?: Array<{ id: string; name: string; model?: { primary?: string } }>;
  decisionConfig?: {
    policies?: Record<string, unknown>;
    timeoutMs?: number;
    humanApprovalTimeout?: number;
  };
  orchestratorConfig?: {
    maxRetriesPerStage?: number;
    stageTimeouts?: Record<string, number>;
    skipDesignForNonUITasks?: boolean;
    autoEscalateAfterRetries?: boolean;
    notifyTelegramOnStageChange?: boolean;
  };
  vcs?: {
    requestRepo: SqliteRequestRepository;
    branchService: BranchService;
    prService: PrService;
    labelService: LabelService;
  };
  metricsAggregator?: MetricsAggregator;
}

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: { type: 'text'; text: string }[]; details: unknown }>;
}

import { taskCreateToolDef } from './task-create.js';
import { taskGetToolDef } from './task-get.js';
import { taskSearchToolDef } from './task-search.js';
import { taskUpdateToolDef } from './task-update.js';
import { taskTransitionToolDef } from './task-transition.js';
import { workflowStepRunToolDef } from './workflow-step-run.js';
import { workflowStateGetToolDef } from './workflow-state-get.js';
import { workflowEventsQueryToolDef } from './workflow-events-query.js';
import { qualityTestsToolDef } from './quality-tests.js';
import { qualityCoverageToolDef } from './quality-coverage.js';
import { qualityLintToolDef } from './quality-lint.js';
import { qualityComplexityToolDef } from './quality-complexity.js';
import { qualityGateToolDef } from './quality-gate.js';
import { vcsBranchCreateToolDef } from './vcs-branch-create.js';
import { vcsPrCreateToolDef } from './vcs-pr-create.js';
import { vcsPrUpdateToolDef } from './vcs-pr-update.js';
import { vcsLabelSyncToolDef } from './vcs-label-sync.js';
import { withCostTracking } from './cost-tracking.js';
import { projectListToolDef } from './project-list.js';
import { projectSwitchToolDef } from './project-switch.js';
import { projectRegisterToolDef } from './project-register.js';
import { teamMessageToolDef, teamInboxToolDef, teamReplyToolDef, teamStatusToolDef, teamAssignToolDef } from './team-messaging.js';
import { decisionEvaluateToolDef, decisionLogToolDef, decisionOutcomeToolDef } from './decision-engine.js';
import { decisionPatternsToolDef } from './decision-patterns.js';
import { pipelineStartToolDef, pipelineStatusToolDef, pipelineRetryToolDef, pipelineSkipToolDef } from './pipeline.js';
import { pipelineAdvanceToolDef, pipelineMetricsToolDef, pipelineTimelineToolDef } from './pipeline-advance.js';
import { metricsRefreshToolDef } from '../observability/metrics-refresh-tool.js';
import type { MetricsAggregator } from '../observability/metrics-aggregator.js';

export function getAllToolDefs(deps: ToolDeps): ToolDef[] {
  const toolDefs = [
    taskCreateToolDef(deps),
    taskGetToolDef(deps),
    taskSearchToolDef(deps),
    taskUpdateToolDef(deps),
    taskTransitionToolDef(deps),
    workflowStepRunToolDef(deps),
    workflowStateGetToolDef(deps),
    workflowEventsQueryToolDef(deps),
    qualityTestsToolDef(deps),
    qualityCoverageToolDef(deps),
    qualityLintToolDef(deps),
    qualityComplexityToolDef(deps),
    qualityGateToolDef(deps),
    vcsBranchCreateToolDef(deps),
    vcsPrCreateToolDef(deps),
    vcsPrUpdateToolDef(deps),
    vcsLabelSyncToolDef(deps),
    projectListToolDef(deps),
    projectSwitchToolDef(deps),
    projectRegisterToolDef(deps),
    teamMessageToolDef(deps),
    teamInboxToolDef(deps),
    teamReplyToolDef(deps),
    teamStatusToolDef(deps),
    teamAssignToolDef(deps),
    decisionEvaluateToolDef(deps),
    decisionLogToolDef(deps),
    decisionOutcomeToolDef(deps),
    decisionPatternsToolDef(deps),
    pipelineStartToolDef(deps),
    pipelineStatusToolDef(deps),
    pipelineRetryToolDef(deps),
    pipelineSkipToolDef(deps),
    pipelineAdvanceToolDef(deps),
    pipelineMetricsToolDef(deps),
    pipelineTimelineToolDef(deps),
  ];

  if (deps.metricsAggregator) {
    toolDefs.push(metricsRefreshToolDef(deps, deps.metricsAggregator));
  }

  return toolDefs.map((tool) => withCostTracking(tool, deps));
}
