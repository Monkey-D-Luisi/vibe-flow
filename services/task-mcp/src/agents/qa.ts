import Ajv from 'ajv';
import { createRequire } from 'module';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
const require = createRequire(import.meta.url);

// Input schema for QA agent (uses reviewer report)
const qaInputSchema = {
  type: 'object',
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
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
    summary: { type: 'string' }
  },
  required: ['violations', 'summary']
};
const qaInputValidator = ajv.compile(qaInputSchema);

// Output schema validation
let qaReportSchema;
try {
  qaReportSchema = require('../../../packages/schemas/qa_report.schema.json');
} catch (error) {
  // Fallback schema for testing when schema files are not available
  qaReportSchema = {
    type: 'object',
    properties: {
      total: { type: 'integer', minimum: 0 },
      passed: { type: 'integer', minimum: 0 },
      failed: { type: 'integer', minimum: 0 },
      evidence: { type: 'array', items: { type: 'string' } }
    },
    required: ['total', 'passed', 'failed', 'evidence'],
    additionalProperties: false
  };
}
const qaReportValidator = ajv.compile(qaReportSchema);

export interface QaInput {
  violations: Array<{
    rule: string;
    where: string;
    why: string;
    severity: 'low' | 'med' | 'high';
    suggested_fix: string;
  }>;
  summary: string;
}

export interface QaReport {
  total: number;
  passed: number;
  failed: number;
  evidence: string[];
}

export const QA_SYSTEM_PROMPT = `You are QA. You execute the unit/contract/smoke plan defined by architecture.

INSTRUCTIONS:
- Execute unit tests, contract tests, and integration tests
- Verify there are no high severity violations
- Record execution evidence (logs, screenshots, etc.)
- If failed > 0, QA fails and must be fixed before continuing
- Total = passed + failed

MANDATORY OUTPUT:
Valid JSON that exactly complies with the qa_report.schema.json schema.
Exact fields:
- total: number (total tests executed)
- passed: number (tests that passed)
- failed: number (tests that failed)
- evidence: array of strings (execution evidence)

Example output:
{
  "total": 25,
  "passed": 23,
  "failed": 2,
  "evidence": [
    "Unit tests: 20/20 passed",
    "Contract tests: 3/5 failed - API timeout",
    "Screenshot: login_flow.png"
  ]
}`;

export function validateQaInput(input: unknown): QaInput {
  if (!qaInputValidator(input)) {
    throw new Error(`QA input validation failed: ${JSON.stringify(qaInputValidator.errors)}`);
  }
  return input as unknown as QaInput;
}

export function validateQaReport(output: unknown): QaReport {
  if (!qaReportValidator(output)) {
    throw new Error(`QA report validation failed: ${JSON.stringify(qaReportValidator.errors)}`);
  }
  return output as unknown as QaReport;
}
