import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { stateRepo, eventRepo, leaseRepo } from './sharedRepos.js';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const getStateInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id'],
  properties: {
    task_id: { type: 'string', minLength: 5 }
  }
};

const patchStateInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'if_rev', 'patch'],
  properties: {
    task_id: { type: 'string', minLength: 5 },
    if_rev: { type: 'integer', minimum: 0 },
    patch: { type: 'object' }
  }
};

const acquireLockInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'owner_agent'],
  properties: {
    task_id: { type: 'string', minLength: 5 },
    owner_agent: { type: 'string', minLength: 2 },
    ttl_seconds: { type: 'integer', minimum: 1, maximum: 3600 }
  }
};

const releaseLockInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'lease_id'],
  properties: {
    task_id: { type: 'string', minLength: 5 },
    lease_id: { type: 'string', minLength: 5 }
  }
};

const appendEventInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'type', 'payload'],
  properties: {
    task_id: { type: 'string', minLength: 5 },
    type: { type: 'string', minLength: 2 },
    payload: { type: 'object' }
  }
};

const searchEventInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_id: { type: 'string', minLength: 5 },
    type: { type: 'string', minLength: 2 },
    limit: { type: 'integer', minimum: 1, maximum: 200 }
  }
};

const validateGetStateInput = schemaValidator.compile(getStateInputSchema);
const validatePatchStateInput = schemaValidator.compile(patchStateInputSchema);
const validateAcquireLockInput = schemaValidator.compile(acquireLockInputSchema);
const validateReleaseLockInput = schemaValidator.compile(releaseLockInputSchema);
const validateAppendEventInput = schemaValidator.compile(appendEventInputSchema);
const validateSearchEventInput = schemaValidator.compile(searchEventInputSchema);

export async function handleStateGet(input: unknown): Promise<any> {
  if (!validateGetStateInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string };
  const state = stateRepo.get(args.task_id);
  if (!state) {
    throw new SemanticError(404, 'State not found');
  }
  return state;
}

export async function handleStatePatch(input: unknown): Promise<any> {
  if (!validatePatchStateInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string; if_rev: number; patch: any };
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
}

export async function handleStateAcquireLock(input: unknown): Promise<any> {
  if (!validateAcquireLockInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string; owner_agent: string; ttl_seconds?: number };
  try {
    return leaseRepo.acquire(args.task_id, args.owner_agent, args.ttl_seconds ?? 300);
  } catch (error) {
    if (error instanceof Error && error.message === 'Lease held by another agent') {
      throw new SemanticError(423, error.message);
    }
    throw error;
  }
}

export async function handleStateReleaseLock(input: unknown): Promise<any> {
  if (!validateReleaseLockInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string; lease_id: string };
  const released = leaseRepo.release(args.task_id, args.lease_id);
  return { released };
}

export async function handleStateAppendEvent(input: unknown): Promise<any> {
  if (!validateAppendEventInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string; type: string; payload: any };
  const state = stateRepo.get(args.task_id);
  if (!state) {
    throw new SemanticError(404, 'State not found');
  }
  return eventRepo.append(args.task_id, args.type, args.payload);
}

export async function handleStateSearch(input: unknown): Promise<any> {
  if (!validateSearchEventInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id?: string; type?: string; limit?: number };
  if (args.task_id) {
    const state = stateRepo.get(args.task_id);
    if (!state) {
      throw new SemanticError(404, 'State not found');
    }
  }
  return eventRepo.search(args.task_id, args.type, args.limit ?? 100);
}
