import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { TaskNotFoundError, OptimisticLockError } from '../../../repo/repository.js';
import { mergeTaskWithPatch } from '../../../orchestrator/patch.js'
import { TaskRecord } from '../../../domain/TaskRecord.js';
import { repo } from './sharedRepos.js';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const getInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 5 }
  }
};

const updateInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'if_rev', 'patch'],
  properties: {
    id: { type: 'string', minLength: 5 },
    if_rev: { type: 'integer', minimum: 0 },
    patch: { type: 'object' }
  }
};

const searchInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string' },
    status: { type: 'array', items: { type: 'string' } },
    labels: { type: 'array', items: { type: 'string' } },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    offset: { type: 'integer', minimum: 0 }
  }
};

const validateGetInput = schemaValidator.compile(getInputSchema);
const validateUpdateInput = schemaValidator.compile(updateInputSchema);
const validateSearchInput = schemaValidator.compile(searchInputSchema);

export async function handleTaskGet(input: unknown): Promise<any> {
  if (!validateGetInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { id: string };
  const record = repo.get(args.id);
  if (!record) {
    throw new SemanticError(404, 'Task not found');
  }
  return record;
}

export async function handleTaskUpdate(input: unknown): Promise<any> {
  if (!validateUpdateInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { id: string; if_rev: number; patch: any };
  try {
    return repo.update(args.id, args.if_rev, args.patch);
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      throw new SemanticError(404, error.message);
    }
    if (error instanceof OptimisticLockError) {
      throw new SemanticError(409, error.message);
    }
    throw error;
  }
}

export async function handleTaskSearch(input: unknown): Promise<any> {
  if (!validateSearchInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as any;
  return repo.search(args);
}