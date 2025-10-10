import Ajv from 'ajv';
import { AgentType, nextAgent, getAgentInputSchema, getAgentOutputSchema } from './router';
import { TaskRepository } from '../repo/sqlite';
import { StateRepository, EventRepository, LeaseRepository } from '../repo/state';
import { TaskRecord } from '../domain/TaskRecord';

const ajv = new Ajv({ allErrors: true, strict: false });

// Initialize repositories
const repo = new TaskRepository();
const stateRepo = new StateRepository(repo.database);
const eventRepo = new EventRepository(repo.database);
const leaseRepo = new LeaseRepository(repo.database);

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
        done_if: ['User can login successfully', 'Password is encrypted']
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
        passed: 23,
        failed: 2,
        evidence: [
          'Unit tests: 20/20 passed',
          'Integration tests: 3/5 failed - timeout issues',
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
export async function runOrchestratorStep(taskId: string, agentName: string): Promise<any> {
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

    // Prepare input for the agent
    const input = prepareAgentInput(task, state, agentType);

    // Log handoff event
    eventRepo.append(taskId, 'handoff', {
      from_agent: state.last_agent,
      to_agent: agentType,
      state: state.current,
      input_summary: summarizeInput(input)
    });

    // Run the agent
    const output = await runAgent(agentType, input);

    // Validate output
    const validatedOutput = validateAgentOutput(agentType, output);

    // Update task record with agent output
    updateTaskWithAgentOutput(task, agentType, validatedOutput);

    // Update orchestrator state
    const nextState = getNextState(state.current, agentType);
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
    'po_check': ['po'], // PO can re-review
    'qa': ['qa'],
    'pr': ['prbot']
  };

  const allowedAgents = stateToAgentMap[currentState as keyof typeof stateToAgentMap] || [];
  return allowedAgents.includes(agentType);
}

function getNextState(currentState: string, agentType: AgentType): string {
  const transitions = {
    'po': 'arch',
    'arch': 'dev',
    'dev': 'review',
    'review': 'qa', // Assuming review passes
    'qa': 'pr', // Assuming QA passes
    'pr': 'done'
  };

  // Special cases
  if (agentType === 'reviewer') {
    // This would be determined by the reviewer output
    return 'qa'; // For now, assume it passes
  }

  return transitions[currentState as keyof typeof transitions] || currentState;
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

function updateTaskWithAgentOutput(task: TaskRecord, agentType: AgentType, output: any): void {
  const patch: any = {};

  switch (agentType) {
    case 'po':
      // Store PO output in appropriate fields
      break;
    case 'architect':
      // Store architect output (ADR, contracts, etc.)
      if (output.adr_id) patch.adr_id = output.adr_id;
      if (output.contracts) patch.contracts = output.contracts;
      if (output.patterns) patch.patterns = output.patterns;
      if (output.test_plan) patch.test_plan = output.test_plan;
      break;
    case 'dev':
      // Store dev output (metrics, logs, etc.)
      if (output.metrics) patch.metrics = output.metrics;
      if (output.red_green_refactor_log) patch.red_green_refactor_log = output.red_green_refactor_log;
      if (output.diff_summary) patch.diff_summary = output.diff_summary;
      break;
    case 'reviewer':
      // Store reviewer output
      if (output.violations) patch.review_notes = output.violations.map((v: any) => `${v.rule}: ${v.message}`);
      break;
    case 'qa':
      // Store QA output
      if (output.total !== undefined && output.passed !== undefined && output.failed !== undefined) {
        patch.qa_report = { total: output.total, passed: output.passed, failed: output.failed };
      }
      break;
    case 'prbot':
      // Store PR output
      if (output.branch) patch.branch = output.branch;
      break;
  }

  if (Object.keys(patch).length > 0) {
    repo.update(task.id, task.rev, patch);
  }
}

function summarizeInput(input: any): string {
  return `Task: ${input.title} (${input.scope})`;
}

function summarizeOutput(output: any): string {
  if (output.summary) return output.summary;
  if (output.diff_summary) return output.diff_summary;
  if (output.total !== undefined) return `Tests: ${output.passed}/${output.total} passed`;
  return 'Output generated';
}

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