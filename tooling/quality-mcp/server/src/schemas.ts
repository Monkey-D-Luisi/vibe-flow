import type { FastifySchema } from 'fastify';

const toolPattern = '^quality\\.(run_tests|coverage_report|lint|complexity)$';

export const invokeSchema: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['tool', 'input'],
    properties: {
      tool: { type: 'string', pattern: toolPattern },
      input: { type: 'object' },
      requestId: { type: 'string' },
      stream: { type: 'boolean' },
      timeoutMs: { type: 'integer', minimum: 1000 }
    }
  }
};

export const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'requestId'],
  properties: {
    ok: { type: 'boolean' },
    requestId: { type: 'string' },
    tool: { type: 'string', pattern: toolPattern },
    result: { type: 'object', additionalProperties: true },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'UNAUTHORIZED',
            'FORBIDDEN',
            'RATE_LIMIT',
            'TIMEOUT',
            'RUNNER_ERROR',
            'PARSE_ERROR',
            'VALIDATION_ERROR',
            'NOT_FOUND',
            'INTERNAL_ERROR'
          ]
        },
        message: { type: 'string' }
      }
    }
  }
};

export const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'requestId', 'error'],
  properties: {
    ok: { type: 'boolean', const: false },
    requestId: { type: 'string' },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'UNAUTHORIZED',
            'FORBIDDEN',
            'RATE_LIMIT',
            'TIMEOUT',
            'RUNNER_ERROR',
            'PARSE_ERROR',
            'VALIDATION_ERROR',
            'NOT_FOUND',
            'INTERNAL_ERROR'
          ]
        },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } }
      }
    }
  }
};
