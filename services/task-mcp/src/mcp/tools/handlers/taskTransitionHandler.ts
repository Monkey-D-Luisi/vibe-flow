import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { TaskNotFoundError, OptimisticLockError } from '../../../repo/repository.js';
import { type OrchestratorState } from '../../../repo/state.js';
import { TaskRecord, TaskRecordValidator, type TransitionEvidence } from '../../../domain/TaskRecord.js';
import { mergeTaskWithPatch } from '../../../orchestrator/patch.js';
import { repo, stateRepo } from './sharedRepos.js';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const transitionInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'to', 'if_rev'],
  properties: {
    id: { type: 'string', minLength: 5 },
    to: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
    if_rev: { type: 'integer', minimum: 0 },
    evidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        metrics: {
          type: 'object',
          additionalProperties: false,
          properties: {
            coverage: { type: 'number', minimum: 0, maximum: 1 },
            lint: {
              type: 'object',
              additionalProperties: false,
              properties: {
                errors: { type: 'integer', minimum: 0 },
                warnings: { type: 'integer', minimum: 0 }
              }
            }
          }
        },
        red_green_refactor_log: { type: 'array', items: { type: 'string' } },
        qa_report: {
          type: 'object',
          additionalProperties: false,
          required: ['total', 'passed', 'failed'],
          properties: {
            total: { type: 'integer', minimum: 0 },
            passed: { type: 'integer', minimum: 0 },
            failed: { type: 'integer', minimum: 0 }
          }
        },
        violations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              rule: { type: 'string' },
              where: { type: 'string' },
              why: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'med', 'high'] },
              suggested_fix: { type: 'string' }
            },
            required: ['rule', 'where', 'why', 'severity', 'suggested_fix']
          }
        },
        acceptance_criteria_met: { type: 'boolean' },
        merged: { type: 'boolean' },
        fast_track: {
          type: 'object',
          additionalProperties: false,
          properties: {
            eligible: { type: 'boolean' },
            score: { type: 'number', minimum: 0, maximum: 100 }
          }
        }
      }
    }
  }
};

const validateTransitionInput = schemaValidator.compile(transitionInputSchema);

export async function handleTaskTransition(input: unknown): Promise<any> {
  if (!validateTransitionInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }

  const args = input as {
    id: string;
    to: string;
    if_rev: number;
    evidence?: any;
  };

  const current = repo.get(args.id);
  if (!current) {
    throw new SemanticError(404, 'Task not found');
  }

  const state = stateRepo.get(args.id);
  if (!state) {
    throw new SemanticError(404, 'State not found');
  }

  if (state.current !== current.status) {
    throw new SemanticError(409, `State mismatch: task is ${current.status} but orchestrator is ${state.current}`);
  }

  const target = args.to as TaskRecord['status'];
  const patch: Partial<TaskRecord> = { status: target };
  const evidence: TransitionEvidence = {};
  const key = `${current.status}->${args.to}`;
  const suppliedEvidence = args.evidence ?? {};

  // Use early returns and maps instead of switch
  const transitionHandlers: Record<string, () => void> = {
    'dev->review': () => {
      if (Array.isArray(suppliedEvidence.red_green_refactor_log)) {
        patch.red_green_refactor_log = suppliedEvidence.red_green_refactor_log;
        evidence.red_green_refactor_log = suppliedEvidence.red_green_refactor_log;
      }
      if (suppliedEvidence.metrics) {
        const mergedLint = suppliedEvidence.metrics.lint
          ? { ...(current.metrics?.lint ?? {}), ...suppliedEvidence.metrics.lint }
          : current.metrics?.lint;
        patch.metrics = {
          ...(current.metrics ?? {}),
          ...suppliedEvidence.metrics,
          ...(mergedLint ? { lint: mergedLint } : {})
        };
        evidence.metrics = {
          coverage: suppliedEvidence.metrics.coverage,
          lint: suppliedEvidence.metrics.lint
        };
      }
    },
    'review->dev': () => {
      patch.rounds_review = (current.rounds_review ?? 0) + 1;
    },
    'qa->dev': () => {
      if (suppliedEvidence.qa_report) {
        const { total, passed, failed } = suppliedEvidence.qa_report;
        patch.qa_report = { total, passed, failed };
        evidence.qa_report = { total, passed, failed };
      }
    },
    'qa->pr': () => {
      if (suppliedEvidence.qa_report) {
        const { total, passed, failed } = suppliedEvidence.qa_report;
        patch.qa_report = { total, passed, failed };
        evidence.qa_report = { total, passed, failed };
      }
    },
    'review->po_check': () => {
      if (Array.isArray(suppliedEvidence.violations)) {
        evidence.violations = suppliedEvidence.violations;
        patch.review_notes = suppliedEvidence.violations.map(
          (violation: any) => `${violation.rule} (${violation.where}): ${violation.suggested_fix}`
        );
      }
    },
    'po_check->qa': () => {
      evidence.acceptance_criteria_met = suppliedEvidence.acceptance_criteria_met === true;
      if (!evidence.acceptance_criteria_met) {
        throw new SemanticError(409, 'PO must confirm acceptance criteria before QA');
      }
    },
    'pr->done': () => {
      evidence.merged = suppliedEvidence.merged === true;
      if (!evidence.merged) {
        throw new SemanticError(409, 'PR must be merged to complete task');
      }
    }
  };

  const handler = transitionHandlers[key];
  if (handler) {
    handler();
  }

  handleFastTrackEvidence(suppliedEvidence, evidence, patch, current);

  const candidate = mergeTaskWithPatch(current, patch);
  const validation = TaskRecordValidator.validateTransition(current.status, target, candidate, evidence);
  if (!validation.valid) {
    throw new SemanticError(409, validation.reason ?? 'Transition not allowed');
  }

  try {
    const updatedTask = repo.update(args.id, args.if_rev, patch);

    const statePatch: Partial<OrchestratorState> = {
      current: target,
      previous: state.current
    };
    if (key === 'review->dev') {
      statePatch.rounds_review = (state.rounds_review ?? 0) + 1;
    }

    stateRepo.update(args.id, state.rev, statePatch);

    return updatedTask;
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      throw new SemanticError(409, error.message);
    }
    if (error instanceof TaskNotFoundError) {
      throw new SemanticError(404, error.message);
    }
    throw error;
  }
}

function handleFastTrackEvidence(suppliedEvidence: any, evidence: TransitionEvidence, patch: Partial<TaskRecord>, current: TaskRecord): void {
  if (suppliedEvidence.fast_track) {
    evidence.fast_track = suppliedEvidence.fast_track;
    const eligible = suppliedEvidence.fast_track.eligible;
    const tags = new Set(current.tags ?? []);
    tags.add('fast-track');
    tags.delete('fast-track:revoked');
    if (eligible) {
      tags.add('fast-track:eligible');
      tags.delete('fast-track:blocked');
    } else {
      tags.add('fast-track:blocked');
      tags.delete('fast-track:eligible');
    }
    patch.tags = Array.from(tags);
  }
}