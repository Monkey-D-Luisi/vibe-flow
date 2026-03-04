import type Database from 'better-sqlite3';
import { vi } from 'vitest';
import { createTestDatabase } from '../../helpers.js';
import { SqliteTaskRepository } from '../../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../../src/persistence/lease-repository.js';
import { EventLog } from '../../../src/orchestrator/event-log.js';
import { createValidator } from '../../../src/schemas/validator.js';
import type { ToolDef, ToolDeps } from '../../../src/tools/index.js';
import { pipelineStartToolDef, pipelineStatusToolDef, pipelineRetryToolDef, pipelineSkipToolDef } from '../../../src/tools/pipeline.js';
import { teamMessageToolDef, teamInboxToolDef, teamReplyToolDef, teamStatusToolDef, teamAssignToolDef } from '../../../src/tools/team-messaging.js';
import { decisionEvaluateToolDef, decisionLogToolDef } from '../../../src/tools/decision-engine.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../../src/orchestrator/transition-guards.js';

const PIPELINE_STAGES = [
  'IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION', 'DESIGN',
  'IMPLEMENTATION', 'QA', 'REVIEW', 'SHIPPING', 'DONE',
] as const;

const STAGE_OWNERS: Record<string, string> = {
  IDEA: 'pm', ROADMAP: 'pm', REFINEMENT: 'po', DECOMPOSITION: 'tech-lead',
  DESIGN: 'designer', IMPLEMENTATION: 'back-1', QA: 'qa',
  REVIEW: 'tech-lead', SHIPPING: 'devops', DONE: 'system',
};

export const DEFAULT_AGENT_CONFIG = [
  { id: 'pm', name: 'Product Manager', model: { primary: 'gpt-4o' } },
  { id: 'po', name: 'Product Owner', model: { primary: 'gpt-4o' } },
  { id: 'tech-lead', name: 'Tech Lead', model: { primary: 'claude-opus-4-6' } },
  { id: 'designer', name: 'Designer', model: { primary: 'gpt-4o' } },
  { id: 'back-1', name: 'Backend Dev', model: { primary: 'claude-sonnet-4-6' } },
  { id: 'front-1', name: 'Frontend Dev', model: { primary: 'claude-sonnet-4-6' } },
  { id: 'qa', name: 'QA Engineer', model: { primary: 'gpt-4o-mini' } },
  { id: 'devops', name: 'DevOps Engineer', model: { primary: 'gpt-4o-mini' } },
];

export interface PipelineTools {
  pipelineStart: ToolDef;
  pipelineStatus: ToolDef;
  pipelineRetry: ToolDef;
  pipelineSkip: ToolDef;
  teamMessage: ToolDef;
  teamInbox: ToolDef;
  teamReply: ToolDef;
  teamStatus: ToolDef;
  teamAssign: ToolDef;
  decisionEvaluate: ToolDef;
  decisionLog: ToolDef;
}

export interface PipelineHarness {
  db: Database.Database;
  deps: ToolDeps;
  tools: PipelineTools;
  advanceToStage: (taskId: string, stage: string) => void;
  cleanup: () => void;
}

let callCounter = 0;

export function nextCallId(): string {
  return `call-e2e-${String(++callCounter).padStart(5, '0')}`;
}

export function createPipelineHarness(options?: {
  agentConfig?: Array<{ id: string; name: string; model?: { primary?: string } }>;
  decisionPolicies?: Record<string, unknown>;
  projectConfig?: { projects?: Array<Record<string, unknown>>; activeProject?: string };
}): PipelineHarness {
  const db = createTestDatabase();
  let idCounter = 0;

  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);

  const generateId = () => `01E2E_${String(++idCounter).padStart(10, '0')}`;
  const now = () => '2026-03-01T12:00:00.000Z';
  const eventLog = new EventLog(eventRepo, generateId, now);

  const deps: ToolDeps = {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog,
    generateId,
    now,
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
    projectConfig: options?.projectConfig ?? { projects: [], activeProject: 'test-project' },
    agentConfig: options?.agentConfig ?? DEFAULT_AGENT_CONFIG,
    decisionConfig: { policies: options?.decisionPolicies ?? {} },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };

  const tools: PipelineTools = {
    pipelineStart: pipelineStartToolDef(deps),
    pipelineStatus: pipelineStatusToolDef(deps),
    pipelineRetry: pipelineRetryToolDef(deps),
    pipelineSkip: pipelineSkipToolDef(deps),
    teamMessage: teamMessageToolDef(deps),
    teamInbox: teamInboxToolDef(deps),
    teamReply: teamReplyToolDef(deps),
    teamStatus: teamStatusToolDef(deps),
    teamAssign: teamAssignToolDef(deps),
    decisionEvaluate: decisionEvaluateToolDef(deps),
    decisionLog: decisionLogToolDef(deps),
  };

  function advanceToStage(taskId: string, stage: string): void {
    const task = taskRepo.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const meta = (task.metadata ?? {}) as Record<string, unknown>;
    taskRepo.update(taskId, {
      metadata: {
        ...meta,
        pipelineStage: stage,
        pipelineOwner: STAGE_OWNERS[stage] ?? 'system',
      },
    }, task.rev, now());
  }

  return {
    db,
    deps,
    tools,
    advanceToStage,
    cleanup: () => db.close(),
  };
}

export function getPipelineStage(result: unknown): string {
  const d = (result as { details: { tasks: Array<{ stage: string }> } }).details;
  return d.tasks[0]?.stage ?? '';
}

export function getPipelineStages(result: unknown): string[] {
  const d = (result as { details: { tasks: Array<{ stage: string }> } }).details;
  return d.tasks.map((t) => t.stage);
}

export function getDecisionDetails(result: unknown): {
  decisionId: string;
  decision: string | null;
  escalated: boolean;
  approver: string | null;
} {
  return (result as { details: { decisionId: string; decision: string | null; escalated: boolean; approver: string | null } }).details;
}

export function getMessageId(result: unknown): string {
  return (result as { details: { messageId: string } }).details.messageId;
}

export function getMessages(result: unknown): Array<{ from: string; to: string; subject: string; body: string }> {
  return (result as { details: { messages: Array<{ from: string; to: string; subject: string; body: string }> } }).details.messages;
}

export function getDecisions(result: unknown): Array<{ category: string; decision: string | null; escalated: boolean }> {
  return (result as { details: { decisions: Array<{ category: string; decision: string | null; escalated: boolean }> } }).details.decisions;
}

export { PIPELINE_STAGES };
