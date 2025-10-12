import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ulid } from 'ulid';
import { TaskRepository } from '../../../repo/repository.js';
import { StateRepository } from '../../../repo/state.js';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const createInputSchema = {
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
};

const validateCreateInput = schemaValidator.compile(createInputSchema);

const repo = new TaskRepository();
const stateRepo = new StateRepository(repo.database);

export async function handleTaskCreate(input: unknown): Promise<any> {
  if (!validateCreateInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }

  const args = input as {
    title: string;
    description?: string;
    acceptance_criteria: string[];
    scope: 'minor' | 'major';
    tags?: string[];
    links?: any;
  };

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
  stateRepo.create(record.id);
  return record;
}