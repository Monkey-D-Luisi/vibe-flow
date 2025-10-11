import Ajv from 'ajv';
import { AgentType } from './router';
import { TaskRepository } from '../repo/sqlite';
import { StateRepository, EventRepository, LeaseRepository } from '../repo/state';
import { TaskRecord, TaskRecordValidator, type TransitionEvidence } from '../domain/TaskRecord';
import { evaluateFastTrack, guardPostDev, FastTrackContext } from '../domain/FastTrack';
import { FastTrackGitHub } from '../domain/FastTrackGitHub';
import { mapAgentOutput } from './mappers.js';

const ajv = new Ajv({ allErrors: true, strict: false });

// Initialize repositories
const repo = new TaskRepository();
const stateRepo = new StateRepository(repo.database);
const eventRepo = new EventRepository(repo.database);
const leaseRepo = new LeaseRepository(repo.database);

// Mock GitHub functions for fast-track automation
const mockGitHub = {
  openPR: async (args: any) => {
    console.log('Mock GitHub: Opening PR', args);
    return { number: Math.floor(Math.random() * 1000) + 1, ...args };
  },
  addLabels: async (args: any) => {
    console.log('Mock GitHub: Adding labels', args);
    return { added: true };
  },
  comment: async (args: any) => {
    console.log('Mock GitHub: Adding comment', args);
    return { commented: true };
  }
};

// Initialize FastTrack GitHub automation
const fastTrackGitHub = new FastTrackGitHub(
  mockGitHub.openPR,
  mockGitHub.addLabels,
  mockGitHub.comment
);

// Mock agent execution - in real implementation this would call OpenAI Agent Builder or similar
export async function runAgent(agent: AgentType, input: any): Promise<any> {
  // This is a placeholder - in real implementation would call the actual agent
  // For now, return mock data that matches the expected schema

  console.log(`Running agent: ${agent}`, input);

  // Mock responses for testing
  switch (agent) {
    case 'po':
      return {
        title: input.title,
        acceptance_criteria: input.acceptance_criteria,
        scope: input.scope,
        non_functional: ['Security: data encryption', 'Performance: < 2s response'],
        done_if: ['User can login successfully', 'Password is encrypted'],
        acceptance_criteria_met: true
      };

    case 'architect':
      return {
        modules: ['UserService', 'AuthModule'],
        contracts: [
          { name: 'UserRepository', methods: ['findById', 'save', 'delete'] },
          { name: 'AuthService', methods: ['login', 'logout', 'validateToken'] }
        ],
        patterns: [
          { name: 'Repository', where: 'data access', why: 'abstraction over persistence' },
          { name: 'Service Layer', where: 'business logic', why: 'separation of concerns' }
        ],
        adr_id: 'ADR-001',
        test_plan: ['Unit tests for all services', 'Integration tests for auth flow']
      };

    case 'dev':
      return {
        diff_summary: 'Implemented UserService and AuthModule with TDD',
        metrics: {
          coverage: 0.85,
          lint: { errors: 0, warnings: 2 }
        },
        red_green_refactor_log: [
          'RED: UserService.findById test fails',
          'GREEN: Implemented UserService.findById',
          'REFACTOR: Extracted UserValidator interface'
        ]
      };

    case 'reviewer':
      return {
        violations: [
          {
            rule: 'SOLID - Single Responsibility',
            where: 'AuthService.login()',
            why: 'Method handles validation and authentication',
            severity: 'med',
            suggested_fix: 'Extract AuthValidator class'
          }
        ],
        summary: 'Good implementation with minor improvements needed'
      };

    case 'qa':
      return {
        total: 25,
        passed: 25,
        failed: 0,
        evidence: [
          'Unit tests: 25/25 passed',
          'Coverage report: coverage.json'
        ]
      };

    case 'prbot':
      return {
        branch: 'feature/user-auth',
        pr_url: 'https://github.com/org/repo/pull/123',
        checklist: [
          '✅ ACs cumplidos',
          '✅ RGR log: red→green→refactor',
          '✅ Cobertura ≥ 80%',
          '✅ Lint 0 errores',
          '✅ ADR-001 registrado',
          '✅ QA: 23/25 tests pasaron'
        ]
      };

    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

// Run one step of the orchestrator for a task
export async function runOrchestratorStep(
  taskId: string,
  agentName: string,
  options: { fastTrackContext?: FastTrackContext; reviewerViolations?: Array<{ severity: string }> } = {}
): Promise<any> {
  // Acquire lease for exclusive access
  const lease = leaseRepo.acquire(taskId, agentName, 300); // 5 minute lease

  try {
    // Get current state
    let state = stateRepo.get(taskId);
    if (!state) {
      // Initialize state if it doesn't exist
      state = stateRepo.create(taskId);
    }

    // Get task record for context
    const task = repo.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Determine which agent to run based on current state
    const agentType = agentName as AgentType;
    if (!canRunAgent(state.current, agentType)) {
      throw new Error(`Agent ${agentType} cannot run in state ${state.current}`);
    }

    const { fastTrackContext, reviewerViolations } = options;

    // Prepare input for the agent
    const input = prepareAgentInput(task, state, agentType);

    // Log handoff event
    eventRepo.append(taskId, 'handoff', {
      from_agent: state.last_agent,
      to_agent: agentType,
      state: state.current,
      input_summary: summarizeInput(input)
    });

    if (state.current === 'po' && agentType === 'po' && fastTrackContext) {
      const evaluationContext = cloneFastTrackContext(fastTrackContext, task);
      const evaluation = evaluateFastTrack(evaluationContext);
      const tagsSet = new Set(task.tags ?? []);
      tagsSet.add('fast-track');
      tagsSet.delete('fast-track:revoked');
      if (evaluation.eligible) {
        tagsSet.add('fast-track:eligible');
        tagsSet.delete('fast-track:blocked');
      } else {
        tagsSet.add('fast-track:blocked');
        tagsSet.delete('fast-track:eligible');
      }

      const updated = repo.update(task.id, task.rev, { tags: Array.from(tagsSet) });
      Object.assign(task, updated);

      eventRepo.append(taskId, 'fasttrack', {
        action: 'evaluated',
        eligible: evaluation.eligible,
        score: evaluation.score,
        reasons: evaluation.reasons,
        hardBlocks: evaluation.hardBlocks
      });

      const prNumber = getPrNumber(task);
      if (prNumber) {
        await fastTrackGitHub.onFastTrackEvaluated(task, evaluation, prNumber);
      }
    }

    // Run the agent
    const output = await runAgent(agentType, input);

    // Validate output
    const validatedOutput = validateAgentOutput(agentType, output);

    const nextState = determineNextState(state.current, task);
    const agentPatch = mapAgentOutput(agentType, validatedOutput);
    const patch: Partial<TaskRecord> = { ...agentPatch };
    if (nextState && task.status !== nextState) {
      patch.status = nextState as TaskRecord['status'];
    }

    const candidateTask = applyPatchToTask(task, patch);
    const transitionEvidence = buildTransitionEvidence(
      state.current as TaskRecord['status'],
      nextState as TaskRecord['status'],
      validatedOutput
    );
    const validation = TaskRecordValidator.validateTransition(
      task.status,
      nextState as TaskRecord['status'],
      candidateTask,
      transitionEvidence
    );

    if (!validation.valid) {
      throw new Error(`Transition guard failed: ${validation.reason ?? 'Unknown reason'}`);
    }

    const updatedTask = repo.update(task.id, task.rev, patch);
    Object.assign(task, updatedTask);

    // Update orchestrator state
    const stateUpdate: any = {
      current: nextState,
      previous: state.current,
      last_agent: agentType
    };

    // Handle special state transitions
    if (agentType === 'reviewer' && nextState === 'dev') {
      stateUpdate.rounds_review = (state.rounds_review || 0) + 1;
    }

    const updatedState = stateRepo.update(taskId, state.rev, stateUpdate);

    // POST-DEV GUARD: Check if fast-track should be revoked
    if (agentType === 'dev' && wasFastTrack(updatedTask)) {
      const guardCtx = cloneFastTrackContext(
        fastTrackContext ?? buildDefaultFastTrackContext(updatedTask),
        updatedTask
      );
      const guardResult = guardPostDev(guardCtx, reviewerViolations);

        if (guardResult.revoke) {
          // Revoke fast-track: move back to architect state
          const revokedState = stateRepo.update(taskId, updatedState.rev, {
            current: 'arch',
            previous: updatedState.current,
            last_agent: 'system'
        });

        // Log revocation event
        eventRepo.append(taskId, 'fasttrack', {
          action: 'revoked',
          reason: guardResult.reason,
          previous_state: updatedState.current,
          new_state: 'arch'
        });

          // GitHub automation for fast-track revocation
          const prNumber = getPrNumber(updatedTask);
          if (prNumber) {
            await fastTrackGitHub.onFastTrackRevoked(updatedTask, guardResult, prNumber);
          }

          // Update task tags
          const tags = updatedTask.tags ? [...updatedTask.tags] : [];
          tags.push('fast-track:revoked');
          const revokedTask = repo.update(taskId, updatedTask.rev, { tags, status: 'arch' });
          Object.assign(updatedTask, revokedTask);

          return {
            task_id: taskId,
            agent: agentType,
            output: validatedOutput,
          new_state: revokedState,
          lease_id: lease.lease_id,
          fasttrack_revoked: true,
          revocation_reason: guardResult.reason
        };
      }
    }

    // Log transition event
    eventRepo.append(taskId, 'transition', {
      from_state: state.current,
      to_state: nextState,
      agent: agentType,
      output_summary: summarizeOutput(validatedOutput)
    });

    return {
      task_id: taskId,
      agent: agentType,
      output: validatedOutput,
      new_state: updatedState,
      lease_id: lease.lease_id
    };

  } finally {
    // Always release the lease
    leaseRepo.release(taskId, lease.lease_id);
  }
}

function canRunAgent(currentState: string, agentType: AgentType): boolean {
  const stateToAgentMap = {
    'po': ['po'],
    'arch': ['architect'],
    'dev': ['dev'],
    'review': ['reviewer'],
    'po_check': ['po'],
    'qa': ['qa'],
    'pr': ['prbot'],
    'done': []
  };

  const allowedAgents = stateToAgentMap[currentState as keyof typeof stateToAgentMap] || [];
  return allowedAgents.includes(agentType);
}

function shouldFastTrack(task: TaskRecord): boolean {
  if (task.scope !== 'minor') {
    return false;
  }
  const tags = task.tags || [];
  const hasEligible = tags.includes('fast-track') && tags.includes('fast-track:eligible');
  const revoked = tags.includes('fast-track:revoked');
  return hasEligible && !revoked;
}

function determineNextState(currentState: string, task: TaskRecord): TaskRecord['status'] {
  switch (currentState) {
    case 'po':
      return shouldFastTrack(task) ? 'dev' : 'arch';
    case 'arch':
      return 'dev';
    case 'dev':
      return 'review';
    case 'review':
      return 'po_check';
    case 'po_check':
      return 'qa';
    case 'qa':
      return 'pr';
    case 'pr':
      return 'done';
    default:
      return currentState as TaskRecord['status'];
  }
}

function prepareAgentInput(task: TaskRecord, state: any, agentType: AgentType): any {
  // Base input from task
  const baseInput = {
    task_id: task.id,
    title: task.title,
    description: task.description,
    acceptance_criteria: task.acceptance_criteria,
    scope: task.scope
  };

  // Add agent-specific context based on available task data
  switch (agentType) {
    case 'architect':
      return {
        ...baseInput,
        // Add any architect-specific inputs from task data
      };
    case 'dev':
      return {
        ...baseInput,
        // Add any dev-specific inputs from task data
      };
    case 'reviewer':
      return {
        ...baseInput,
        // Add any reviewer-specific inputs from task data
      };
    case 'qa':
      return {
        ...baseInput,
        // Add any qa-specific inputs from task data
      };
    case 'prbot':
      return {
        ...baseInput,
        // Add any prbot-specific inputs from task data
      };
    default:
      return baseInput;
  }
}

function applyPatchToTask(task: TaskRecord, patch: Partial<TaskRecord>): TaskRecord {
  const candidate: TaskRecord = {
    ...task,
    ...patch,
    status: (patch.status ?? task.status) as TaskRecord['status']
  };

  if (task.metrics || patch.metrics) {
    candidate.metrics = {
      ...(task.metrics ?? {}),
      ...(patch.metrics ?? {}),
      lint: patch.metrics?.lint
        ? { ...(task.metrics?.lint ?? {}), ...patch.metrics.lint }
        : task.metrics?.lint
    };
  }

  if (task.qa_report || patch.qa_report) {
    candidate.qa_report = { ...(task.qa_report ?? {}), ...(patch.qa_report ?? {}) };
  }

  if (patch.review_notes) {
    candidate.review_notes = [...patch.review_notes];
  } else if (task.review_notes) {
    candidate.review_notes = [...task.review_notes];
  }

  if (patch.red_green_refactor_log) {
    candidate.red_green_refactor_log = [...patch.red_green_refactor_log];
  } else if (task.red_green_refactor_log) {
    candidate.red_green_refactor_log = [...task.red_green_refactor_log];
  }

  if (task.links || patch.links) {
    candidate.links = {
      ...(task.links ?? {}),
      ...(patch.links ?? {}),
      github: patch.links?.github
        ? { ...(task.links?.github ?? {}), ...patch.links.github }
        : task.links?.github,
      git: patch.links?.git ? { ...(task.links?.git ?? {}), ...patch.links.git } : task.links?.git
    };
  }

  if (patch.tags) {
    candidate.tags = [...patch.tags];
  } else if (task.tags) {
    candidate.tags = [...task.tags];
  }

  if (typeof patch.acceptance_criteria_met === 'boolean') {
    candidate.acceptance_criteria_met = patch.acceptance_criteria_met;
  }

  return candidate;
}

function buildTransitionEvidence(
  from: TaskRecord['status'],
  to: TaskRecord['status'],
  output: any
): TransitionEvidence | undefined {
  switch (`${from}->${to}`) {
    case 'review->po_check':
      return { violations: output?.violations ?? [] };
    case 'po_check->qa':
      if (typeof output?.acceptance_criteria_met === 'boolean') {
        return { acceptance_criteria_met: output.acceptance_criteria_met };
      }
      return undefined;
    case 'qa->pr':
      if (output && typeof output.total === 'number') {
        return {
          qa_report: {
            total: output.total,
            passed: output.passed,
            failed: output.failed
          }
        };
      }
      return undefined;
    case 'pr->done':
      if (typeof output?.merged === 'boolean') {
        return { merged: output.merged };
      }
      return undefined;
    default:
      return undefined;
  }
}

function wasFastTrack(task: TaskRecord): boolean {
  const tags = task.tags || [];
  return tags.includes('fast-track:eligible') && !tags.includes('fast-track:revoked');
}

function summarizeInput(input: any): string {
  if (input.title) return `Task: ${input.title} (${input.scope})`;
  return 'Input generated';
}

function summarizeOutput(output: any): string {
  if (output.summary) return output.summary;
  if (output.diff_summary) return output.diff_summary;
  if (output.total !== undefined) return `Tests: ${output.passed}/${output.total} passed`;
  return 'Output generated';
}

function getPrNumber(task: TaskRecord): number | undefined {
  const gitLink = task.links?.git;
  if (gitLink?.prNumber) {
    return gitLink.prNumber;
  }
  const githubLink = task.links?.github;
  return githubLink?.issueNumber;
}

function cloneFastTrackContext(ctx: FastTrackContext, task: TaskRecord): FastTrackContext {
  return {
    task,
    diff: {
      files: [...ctx.diff.files],
      locAdded: ctx.diff.locAdded,
      locDeleted: ctx.diff.locDeleted
    },
    quality: {
      coverage: ctx.quality.coverage,
      avgCyclomatic: ctx.quality.avgCyclomatic,
      lintErrors: ctx.quality.lintErrors
    },
    metadata: {
      modulesChanged: ctx.metadata.modulesChanged,
      publicApiChanged: ctx.metadata.publicApiChanged,
      contractsChanged: ctx.metadata.contractsChanged,
      patternsChanged: ctx.metadata.patternsChanged,
      adrChanged: ctx.metadata.adrChanged,
      packagesSchemaChanged: ctx.metadata.packagesSchemaChanged
    }
  };
}

function buildDefaultFastTrackContext(task: TaskRecord): FastTrackContext {
  return {
    task,
    diff: {
      files: [],
      locAdded: 0,
      locDeleted: 0
    },
    quality: {
      coverage: task.metrics?.coverage,
      avgCyclomatic: undefined,
      lintErrors: task.metrics?.lint?.errors ?? 0
    },
    metadata: {
      modulesChanged: false,
      publicApiChanged: false,
      contractsChanged: false,
      patternsChanged: false,
      adrChanged: false,
      packagesSchemaChanged: false
    }
  };
}

export const __test__ = {
  repo,
  stateRepo,
  eventRepo,
  leaseRepo,
  fastTrackGitHub
};

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate agent output against schema
export function validateAgentOutput(agent: AgentType, output: any): any {
  const schemaFile = `${getAgentOutputSchemaFile(agent)}.schema.json`;
  const schemaPath = join(__dirname, '../../../../packages/schemas', schemaFile);

  try {
    const schemaContent = readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaContent);
    const validator = ajv.compile(schema);

    if (!validator(output)) {
      throw new Error(`Agent ${agent} output validation failed: ${JSON.stringify(validator.errors)}`);
    }

    return output;
  } catch (error) {
    throw new Error(`Failed to load schema for ${agent}: ${(error as Error).message}`);
  }
}

function getAgentOutputSchemaFile(agent: AgentType): string {
  const files = {
    po: 'po_brief',
    architect: 'design_ready',
    dev: 'dev_work_output',
    reviewer: 'reviewer_report',
    qa: 'qa_report',
    prbot: 'pr_summary'
  };
  return files[agent];
}
