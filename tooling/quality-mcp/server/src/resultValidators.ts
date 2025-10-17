import { createRequire } from 'node:module';
import type { AnySchema, ValidateFunction } from 'ajv';

type ToolName = 'quality.run_tests' | 'quality.coverage_report' | 'quality.lint' | 'quality.complexity';

const require = createRequire(import.meta.url);
const Ajv = require('ajv').default as typeof import('ajv').default;

const ajv = new Ajv({ allErrors: true, strict: false });

const resultSchemas: Record<ToolName, AnySchema> = {
  'quality.run_tests': {
    type: 'object',
    additionalProperties: true,
    required: ['total', 'passed', 'failed'],
    properties: {
      total: { type: 'number' },
      passed: { type: 'number' },
      failed: { type: 'number' },
      durationMs: { type: 'number' }
    }
  },
  'quality.coverage_report': {
    type: 'object',
    additionalProperties: true,
    required: ['total'],
    properties: {
      total: {
        type: 'object',
        additionalProperties: true,
        required: ['lines'],
        properties: {
          lines: { type: 'number', minimum: 0, maximum: 1 }
        }
      },
      lines: { type: 'number', minimum: 0, maximum: 1 }
    }
  },
  'quality.lint': {
    type: 'object',
    additionalProperties: true,
    required: ['errors'],
    properties: {
      errors: { type: 'number', minimum: 0 },
      warnings: { type: 'number', minimum: 0 },
      summary: {
        type: 'object',
        additionalProperties: true,
        properties: {
          errors: { type: 'number', minimum: 0 },
          warnings: { type: 'number', minimum: 0 }
        }
      }
    }
  },
  'quality.complexity': {
    type: 'object',
    additionalProperties: true,
    required: ['maxCyclomatic', 'avgCyclomatic'],
    properties: {
      maxCyclomatic: { type: 'number', minimum: 0 },
      avgCyclomatic: { type: 'number', minimum: 0 },
      metrics: {
        type: 'object',
        additionalProperties: true,
        properties: {
          max: { type: 'number', minimum: 0 },
          avg: { type: 'number', minimum: 0 }
        }
      }
    }
  }
};

const validators: Record<ToolName, ValidateFunction> = {
  'quality.run_tests': ajv.compile(resultSchemas['quality.run_tests']),
  'quality.coverage_report': ajv.compile(resultSchemas['quality.coverage_report']),
  'quality.lint': ajv.compile(resultSchemas['quality.lint']),
  'quality.complexity': ajv.compile(resultSchemas['quality.complexity'])
};

export function validateToolResult(tool: ToolName, result: unknown): void {
  const validate = validators[tool];
  if (!validate(result)) {
    const message = ajv.errorsText(validate.errors, { separator: '; ' });
    const error = new Error(`Runner output failed validation: ${message}`);
    (error as any).code = 'RUNNER_ERROR';
    throw error;
  }
}
