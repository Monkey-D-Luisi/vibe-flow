import Ajv from 'ajv';
import qaReportSchema from '../../../packages/schemas/qa_report.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });

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

const qaReportValidator = ajv.compile(qaReportSchema as Record<string, unknown>);

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
