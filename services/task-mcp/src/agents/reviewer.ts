import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

// Input schema for reviewer agent (uses dev work output)
const reviewerInputSchema = {
  type: 'object',
  properties: {
    diff_summary: { type: 'string' },
    metrics: {
      type: 'object',
      properties: {
        coverage: { type: 'number', minimum: 0, maximum: 1 },
        lint: {
          type: 'object',
          properties: {
            errors: { type: 'integer', minimum: 0 },
            warnings: { type: 'integer', minimum: 0 }
          },
          required: ['errors', 'warnings']
        }
      },
      required: ['coverage', 'lint']
    },
    red_green_refactor_log: { type: 'array', items: { type: 'string' }, minItems: 2 }
  },
  required: ['diff_summary', 'metrics', 'red_green_refactor_log']
};
const reviewerInputValidator = ajv.compile(reviewerInputSchema);

// Output schema validation
const reviewerReportSchema = require('../../../packages/schemas/reviewer_report.schema.json');
const reviewerReportValidator = ajv.compile(reviewerReportSchema);

export interface ReviewerInput {
  diff_summary: string;
  metrics: {
    coverage: number;
    lint: {
      errors: number;
      warnings: number;
    };
  };
  red_green_refactor_log: string[];
}

export interface ReviewerReport {
  violations: Array<{
    rule: string;
    where: string;
    why: string;
    severity: 'low' | 'med' | 'high';
    suggested_fix: string;
  }>;
  summary: string;
}

export const REVIEWER_SYSTEM_PROMPT = `You are the REVIEWER agent. You evaluate the delivery with SOLID/Patterns rubric.

INSTRUCTIONS:
- Review compliance with SOLID, Clean Code, applied patterns
- Verify TDD (red-green-refactor log present and coherent)
- Evaluate code and architecture quality
- Each violation includes: rule, where, why, severity, suggested_fix
- Severity: high=blocks, med=warning, low=improvement
- If severity=high exists, does not allow passing to PO_CHECK

MANDATORY OUTPUT:
Valid JSON that exactly complies with the reviewer_report.schema.json schema.
Exact fields:
- violations: array of objects {rule, where, why, severity, suggested_fix}
- summary: string (general summary)

Example output:
{
  "violations": [
    {
      "rule": "SOLID-Single Responsibility",
      "where": "UserService.save()",
      "why": "Method does validation AND persistence",
      "severity": "med",
      "suggested_fix": "Extract separate UserValidator"
    }
  ],
  "summary": "Functional code, improvements in separation of responsibilities"
}`;

export function validateReviewerInput(input: unknown): ReviewerInput {
  if (!reviewerInputValidator(input)) {
    throw new Error(`Reviewer input validation failed: ${JSON.stringify(reviewerInputValidator.errors)}`);
  }
  return input as unknown as ReviewerInput;
}

export function validateReviewerReport(output: unknown): ReviewerReport {
  if (!reviewerReportValidator(output)) {
    throw new Error(`Reviewer report validation failed: ${JSON.stringify(reviewerReportValidator.errors)}`);
  }
  return output as unknown as ReviewerReport;
}