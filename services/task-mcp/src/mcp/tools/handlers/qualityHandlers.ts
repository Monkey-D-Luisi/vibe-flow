import Ajv from 'ajv';
import addFormats from 'ajv-formats';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const qualityInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id'],
  properties: {
    task_id: { type: 'string', minLength: 5 }
  }
};

const enforceGatesInputSchema = {
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
};

const validateQualityInput = schemaValidator.compile(qualityInputSchema);
const validateEnforceGatesInput = schemaValidator.compile(enforceGatesInputSchema);

export async function runTests(input: unknown): Promise<any> {
  if (!validateQualityInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string };
  return {
    task_id: args.task_id,
    status: 'passed',
    summary: 'Tests executed via quality runner mock',
    tests: []
  };
}

export async function coverageReport(input: unknown): Promise<any> {
  if (!validateQualityInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string };
  return {
    task_id: args.task_id,
    coverage: {
      lines: 0.82,
      statements: 0.8,
      functions: 0.78,
      branches: 0.75
    }
  };
}

export async function lint(input: unknown): Promise<any> {
  if (!validateQualityInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string };
  return {
    task_id: args.task_id,
    errors: 0,
    warnings: 2,
    summary: 'No lint errors detected'
  };
}

export async function complexity(input: unknown): Promise<any> {
  if (!validateQualityInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string };
  return {
    task_id: args.task_id,
    avgCyclomatic: 4.2,
    hotspots: []
  };
}

export async function enforceGates(input: unknown): Promise<any> {
  if (!validateEnforceGatesInput(input)) {
    throw new SemanticError(422, 'Input validation failed');
  }
  const args = input as { task_id: string; metrics: { coverage: number; lintErrors: number; testsFailed: number } };
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
}