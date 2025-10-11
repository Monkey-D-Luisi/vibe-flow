import Ajv, { type AnyValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ulid } from 'ulid';
import { TaskRepository } from '../repo/sqlite.js';
import { StateRepository, EventRepository, LeaseRepository, type OrchestratorState } from '../repo/state.js';
import { TaskRecord, TaskRecordValidator, type TransitionEvidence } from '../domain/TaskRecord.js';
import { evaluateFastTrack, guardPostDev, FastTrackContext } from '../domain/FastTrack.js';
import { mergeTaskWithPatch } from '../orchestrator/patch.js';

type ToolName =
  | 'task.create'
  | 'task.get'
  | 'task.update'
  | 'task.search'
  | 'task.transition'
  | 'state.get'
  | 'state.patch'
  | 'state.acquire_lock'
  | 'state.release_lock'
  | 'state.append_event'
  | 'state.search'
  | 'fasttrack.evaluate'
  | 'fasttrack.guard_post_dev'
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity'
  | 'quality.enforce_gates'
  | 'gh.createBranch'
  | 'gh.openPR'
  | 'gh.comment'
  | 'gh.setProjectStatus'
  | 'gh.addLabels';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const fastTrackDiffSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['files', 'locAdded', 'locDeleted'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    locAdded: { type: 'integer', minimum: 0 },
    locDeleted: { type: 'integer', minimum: 0 }
  }
};

const fastTrackQualitySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    coverage: { type: 'number', minimum: 0, maximum: 1 },
    avgCyclomatic: { type: 'number', minimum: 0 },
    lintErrors: { type: 'integer', minimum: 0 }
  },
  required: ['lintErrors']
};

const fastTrackMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['modulesChanged', 'publicApiChanged'],
  properties: {
    modulesChanged: { type: 'boolean' },
    publicApiChanged: { type: 'boolean' },
    contractsChanged: { type: 'boolean' },
    patternsChanged: { type: 'boolean' },
    adrChanged: { type: 'boolean' },
    packagesSchemaChanged: { type: 'boolean' }
  }
};

const toolInputSchemas: Record<ToolName, any> = {
  'task.create': {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'acceptance_criteria', 'scope'],
    properties: {
      title: { type: 'string', minLength: 5, maxLength: 120 },
      description: { type: 'string', maxLength: 4000 },
      acceptance_criteria: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 3, maxLength: 300 }
      },
      scope: { type: 'string', enum: ['minor', 'major'] },
      links: {
        type: 'object',
        additionalProperties: false,
        properties: {
          github: {
            type: 'object',
            additionalProperties: false,
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              issueNumber: { type: 'integer', minimum: 1 }
            }
          },
          git: {
            type: 'object',
            additionalProperties: false,
            properties: {
              repo: { type: 'string' },
              branch: { type: 'string' },
              prNumber: { type: 'integer', minimum: 1 }
            }
          }
        }
      },
      tags: { type: 'array', items: { type: 'string' } }
    }
  },
  'task.get': {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 5 }
    }
  },
  'task.update': {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'if_rev', 'patch'],
    properties: {
      id: { type: 'string', minLength: 5 },
      if_rev: { type: 'integer', minimum: 0 },
      patch: { type: 'object' }
    }
  },
  'task.search': {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string' },
      status: { type: 'array', items: { type: 'string' } },
      labels: { type: 'array', items: { type: 'string' } },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      offset: { type: 'integer', minimum: 0 }
    }
  },
  'task.transition': {
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
  },
  'state.get': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'state.patch': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'if_rev', 'patch'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      if_rev: { type: 'integer', minimum: 0 },
      patch: { type: 'object' }
    }
  },
  'state.acquire_lock': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'owner_agent'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      owner_agent: { type: 'string', minLength: 2 },
      ttl_seconds: { type: 'integer', minimum: 1, maximum: 3600 }
    }
  },
  'state.release_lock': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'lease_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      lease_id: { type: 'string', minLength: 5 }
    }
  },
  'state.append_event': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'type', 'payload'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      type: { type: 'string', minLength: 2 },
      payload: { type: 'object' }
    }
  },
  'state.search': {
    type: 'object',
    additionalProperties: false,
    properties: {
      task_id: { type: 'string', minLength: 5 },
      type: { type: 'string', minLength: 2 },
      limit: { type: 'integer', minimum: 1, maximum: 200 }
    }
  },
  'fasttrack.evaluate': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'diff', 'quality', 'metadata'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      diff: fastTrackDiffSchema,
      quality: fastTrackQualitySchema,
      metadata: fastTrackMetadataSchema
    }
  },
  'fasttrack.guard_post_dev': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'diff', 'quality', 'metadata'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      diff: fastTrackDiffSchema,
      quality: fastTrackQualitySchema,
      metadata: fastTrackMetadataSchema,
      reviewer_violations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            rule: { type: 'string' }
          },
          required: ['severity', 'rule']
        }
      }
    }
  },
  'quality.run_tests': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.coverage_report': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.lint': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.complexity': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.enforce_gates': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'metrics'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      metrics: {
        type: 'object',
        additionalProperties: false,
        required: ['coverage', 'lintErrors', 'testsFailed'],
        properties: {
          coverage: { type: 'number', minimum: 0, maximum: 1 },
          lintErrors: { type: 'integer', minimum: 0 },
          testsFailed: { type: 'integer', minimum: 0 }
        }
      }
    }
  },
  'gh.createBranch': {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 3 },
      base: { type: 'string', minLength: 2 }
    }
  },
  'gh.openPR': {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'head'],
    properties: {
      title: { type: 'string', minLength: 5 },
      head: { type: 'string', minLength: 2 },
      base: { type: 'string', minLength: 2 },
      body: { type: 'string' },
      draft: { type: 'boolean' },
      labels: { type: 'array', items: { type: 'string' } }
    }
  },
  'gh.comment': {
    type: 'object',
    additionalProperties: false,
    required: ['number', 'body'],
    properties: {
      number: { type: 'integer', minimum: 1 },
      body: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['issue', 'pr'] }
    }
  },
  'gh.setProjectStatus': {
    type: 'object',
    additionalProperties: false,
    required: ['itemId', 'status'],
    properties: {
      itemId: { type: 'string', minLength: 5 },
      status: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] }
    }
  },
  'gh.addLabels': {
    type: 'object',
    additionalProperties: false,
    required: ['number', 'labels'],
    properties: {
      number: { type: 'integer', minimum: 1 },
      labels: { type: 'array', items: { type: 'string' }, minItems: 1 },
      type: { type: 'string', enum: ['issue', 'pr'] }
    }
  }
};

const toolDescriptions: Record<ToolName, string> = {
  'task.create': 'Crear TaskRecord en estado inicial',
  'task.get': 'Obtener TaskRecord por id',
  'task.update': 'Actualizar TaskRecord con control de versión',
  'task.search': 'Buscar TaskRecords por texto/estado/etiquetas',
  'task.transition': 'Aplicar transición de estado con validaciones de negocio',
  'state.get': 'Obtener el estado del orquestador para una tarea',
  'state.patch': 'Actualizar campos del estado del orquestador',
  'state.acquire_lock': 'Adquirir un lease de ejecución para una tarea',
  'state.release_lock': 'Liberar un lease previamente adquirido',
  'state.append_event': 'Registrar un evento en el journal del orquestador',
  'state.search': 'Consultar eventos del orquestador',
  'fasttrack.evaluate': 'Evaluar elegibilidad fast-track con reglas duras y puntaje',
  'fasttrack.guard_post_dev': 'Reevaluar fast-track después de DEV (guard post-dev)',
  'quality.run_tests': 'Ejecutar suite de pruebas automatizadas',
  'quality.coverage_report': 'Generar reporte de cobertura',
  'quality.lint': 'Ejecutar análisis estático (lint)',
  'quality.complexity': 'Calcular métricas de complejidad',
  'quality.enforce_gates': 'Aplicar quality gates (coverage, lint, tests)',
  'gh.createBranch': 'Crear una rama local/remota',
  'gh.openPR': 'Abrir un Pull Request',
  'gh.comment': 'Publicar un comentario en Issue/PR',
  'gh.setProjectStatus': 'Actualizar estado en GitHub Projects',
  'gh.addLabels': 'Añadir etiquetas a un Issue/PR'
};

const toolValidators = Object.fromEntries(
  Object.entries(toolInputSchemas).map(([name, schema]) => [name, schemaValidator.compile(schema)])
) as Record<string, AnyValidateFunction>;

const repo = new TaskRepository();
const stateRepo = new StateRepository(repo.database);
const eventRepo = new EventRepository(repo.database);
const leaseRepo = new LeaseRepository(repo.database);

const tools = Object.entries(toolInputSchemas).map(([name, schema]) => ({
  name,
  description: toolDescriptions[name as ToolName] ?? `MCP tool ${name}`,
  inputSchema: schema
}));

const toolHandlers: Record<ToolName, (args: any) => Promise<any>> = {
  'task.create': async (args) => {
    const record = repo.create({
      id: `TR-${ulid()}`,
      title: args.title,
      description: args.description,
      acceptance_criteria: args.acceptance_criteria,
      scope: args.scope,
      status: 'po',
      tags: args.tags ?? [],
      links: args.links ?? {}
    });
    return record;
  },
  'task.get': async (args) => {
    const record = repo.get(args.id);
    if (!record) {
      throw new SemanticError(404, 'Task not found');
    }
    return record;
  },
  'task.update': async (args) => {
    try {
      return repo.update(args.id, args.if_rev, args.patch);
    } catch (error) {
      if (error instanceof Error && error.message === 'Task not found') {
        throw new SemanticError(404, 'Task not found');
      }
      if (error instanceof Error && error.message === 'Optimistic lock failed') {
        throw new SemanticError(409, 'Optimistic lock failed');
      }
      throw error;
    }
  },
  'task.search': async (args) => repo.search(args),
  'task.transition': async (args) => {
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

    switch (key) {
      case 'dev->review':
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
        break;
      case 'review->dev':
        patch.rounds_review = (current.rounds_review ?? 0) + 1;
        break;
      case 'qa->dev':
        if (suppliedEvidence.qa_report) {
          const { total, passed, failed } = suppliedEvidence.qa_report;
          patch.qa_report = { total, passed, failed };
          evidence.qa_report = { total, passed, failed };
        }
        break;
      case 'qa->pr':
        if (suppliedEvidence.qa_report) {
          const { total, passed, failed } = suppliedEvidence.qa_report;
          patch.qa_report = { total, passed, failed };
          evidence.qa_report = { total, passed, failed };
        }
        break;
      case 'review->po_check':
        if (Array.isArray(suppliedEvidence.violations)) {
          evidence.violations = suppliedEvidence.violations;
          patch.review_notes = suppliedEvidence.violations.map(
            (violation: any) => `${violation.rule} (${violation.where}): ${violation.suggested_fix}`
          );
        }
        break;
      case 'po_check->qa':
        evidence.acceptance_criteria_met = suppliedEvidence.acceptance_criteria_met === true;
        if (!evidence.acceptance_criteria_met) {
          throw new SemanticError(409, 'PO must confirm acceptance criteria before QA');
        }
        break;
      case 'pr->done':
        evidence.merged = suppliedEvidence.merged === true;
        if (!evidence.merged) {
          throw new SemanticError(409, 'PR must be merged to complete task');
        }
        break;
    }

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
      if (error instanceof Error) {
        if (error.message === 'Optimistic lock failed') {
          throw new SemanticError(409, 'Optimistic lock failed');
        }
        if (error.message === 'State not found') {
          throw new SemanticError(404, 'State not found');
        }
      }
      throw error;
    }
  },
  'state.get': async (args) => {
    const state = stateRepo.get(args.task_id);
    if (!state) {
      throw new SemanticError(404, 'State not found');
    }
    return state;
  },
  'state.patch': async (args) => {
    try {
      return stateRepo.update(args.task_id, args.if_rev, args.patch);
    } catch (error) {
      if (error instanceof Error && error.message === 'State not found') {
        throw new SemanticError(404, 'State not found');
      }
      if (error instanceof Error && error.message === 'Optimistic lock failed') {
        throw new SemanticError(409, 'Optimistic lock failed');
      }
      throw error;
    }
  },
  'state.acquire_lock': async (args) => {
    try {
      return leaseRepo.acquire(args.task_id, args.owner_agent, args.ttl_seconds ?? 300);
    } catch (error) {
      if (error instanceof Error && error.message === 'Lease held by another agent') {
        throw new SemanticError(423, error.message);
      }
      throw error;
    }
  },
  'state.release_lock': async (args) => {
    const released = leaseRepo.release(args.task_id, args.lease_id);
    return { released };
  },
  'state.append_event': async (args) => {
    const state = stateRepo.get(args.task_id);
    if (!state) {
      throw new SemanticError(404, 'State not found');
    }
    return eventRepo.append(args.task_id, args.type, args.payload);
  },
  'state.search': async (args) => {
    if (args.task_id) {
      const state = stateRepo.get(args.task_id);
      if (!state) {
        throw new SemanticError(404, 'State not found');
      }
    }
    return eventRepo.search(args.task_id, args.type, args.limit ?? 100);
  },
  'fasttrack.evaluate': async (args) => {
    const task = repo.get(args.task_id);
    if (!task) {
      throw new SemanticError(404, 'Task not found');
    }
    const context: FastTrackContext = {
      task,
      diff: args.diff,
      quality: args.quality,
      metadata: args.metadata
    };
    const result = evaluateFastTrack(context);
    const tags = new Set(task.tags ?? []);
    tags.add('fast-track');
    tags.delete('fast-track:revoked');
    if (result.eligible) {
      tags.add('fast-track:eligible');
      tags.delete('fast-track:blocked');
    } else {
      tags.add('fast-track:blocked');
      tags.delete('fast-track:eligible');
    }
    const updated = repo.update(task.id, task.rev, { tags: Array.from(tags) });
    eventRepo.append(task.id, 'fasttrack', {
      action: 'evaluated',
      eligible: result.eligible,
      score: result.score,
      reasons: result.reasons,
      hardBlocks: result.hardBlocks
    });
    return { result, task: updated };
  },
  'fasttrack.guard_post_dev': async (args) => {
    const task = repo.get(args.task_id);
    if (!task) {
      throw new SemanticError(404, 'Task not found');
    }
    const state = stateRepo.get(args.task_id);
    if (!state) {
      throw new SemanticError(404, 'State not found');
    }
    const context: FastTrackContext = {
      task,
      diff: args.diff,
      quality: args.quality,
      metadata: args.metadata
    };
    const result = guardPostDev(context, args.reviewer_violations);
    if (result.revoke) {
      const tags = new Set(task.tags ?? []);
      tags.add('fast-track:revoked');
      const updated = repo.update(task.id, task.rev, { tags: Array.from(tags), status: 'arch' });
      eventRepo.append(task.id, 'fasttrack', { action: 'revoked', reason: result.reason });
      try {
        stateRepo.update(args.task_id, state.rev, {
          current: 'arch',
          previous: state.current
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'Optimistic lock failed') {
          throw new SemanticError(409, 'Optimistic lock failed');
        }
        if (error instanceof Error && error.message === 'State not found') {
          throw new SemanticError(404, 'State not found');
        }
        throw error;
      }
      return { result, task: updated };
    }
    return { result, task };
  },
  'quality.run_tests': async (args) => ({
    task_id: args.task_id,
    status: 'passed',
    summary: 'Tests executed via quality runner mock',
    tests: []
  }),
  'quality.coverage_report': async (args) => ({
    task_id: args.task_id,
    coverage: {
      lines: 0.82,
      statements: 0.8,
      functions: 0.78,
      branches: 0.75
    }
  }),
  'quality.lint': async (args) => ({
    task_id: args.task_id,
    errors: 0,
    warnings: 2,
    summary: 'No lint errors detected'
  }),
  'quality.complexity': async (args) => ({
    task_id: args.task_id,
    avgCyclomatic: 4.2,
    hotspots: []
  }),
  'quality.enforce_gates': async (args) => {
    const { coverage, lintErrors, testsFailed } = args.metrics;
    const failures: string[] = [];
    if (coverage < 0.7) failures.push('coverage');
    if (lintErrors > 0) failures.push('lint');
    if (testsFailed > 0) failures.push('tests');
    return {
      task_id: args.task_id,
      passed: failures.length === 0,
      failures
    };
  },
  'gh.createBranch': async (args) => ({
    branch: args.name,
    base: args.base ?? 'main',
    command: `git checkout -b ${args.name} ${args.base ?? 'main'}`
  }),
  'gh.openPR': async (args) => {
    const prNumber = Math.floor(Math.random() * 10_000) + 1;
    return {
    number: prNumber,
    title: args.title,
    head: args.head,
    base: args.base ?? 'main',
    draft: args.draft ?? true,
    labels: args.labels ?? [],
    url: `https://github.com/example/repo/pull/${prNumber}`
    };
  },
  'gh.comment': async (args) => ({
    number: args.number,
    type: args.type ?? 'pr',
    body: args.body,
    commented: true
  }),
  'gh.setProjectStatus': async (args) => ({
    itemId: args.itemId,
    status: args.status,
    updated: true
  }),
  'gh.addLabels': async (args) => ({
    number: args.number,
    type: args.type ?? 'pr',
    labels: args.labels,
    added: true
  })
};

function asSuccess(payload: any) {
  return {
    content: [
      {
        type: 'application/json',
        text: JSON.stringify(payload)
      }
    ]
  };
}

function asError(code: number, message: string, details?: any) {
  return {
    content: [
      {
        type: 'application/json',
        text: JSON.stringify({
          error: {
            code,
            message,
            details
          }
        })
      }
    ],
    isError: true
  };
}

class TaskMCPServer {
  private readonly server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'task-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      if (!toolHandlers[name as ToolName]) {
        return asError(404, `Unknown tool: ${name}`);
      }

      const validator = toolValidators[name as ToolName];
      if (validator && !validator(args)) {
        const details = validator.errors ?? [];
        return asError(422, 'Input validation failed', details);
      }

      try {
        const result = await toolHandlers[name as ToolName](args);
        return asSuccess(result);
      } catch (error) {
        if (error instanceof SemanticError) {
          return asError(error.code, error.message);
        }
        if (error instanceof Error) {
          return asError(500, error.message);
        }
        return asError(500, 'Unknown error');
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Task MCP server started');
  }
}

export { TaskMCPServer };
export const __test__ = {
  toolHandlers,
  toolValidators,
  toolInputSchemas,
  schemaValidator,
  repo,
  stateRepo,
  eventRepo,
  leaseRepo
};
