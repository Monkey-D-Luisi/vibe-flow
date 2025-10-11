import Ajv from 'ajv';
import { loadSchema } from '../utils/loadSchema.js';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });

// Input schema for PR bot agent (uses QA report)
const prBotInputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer', minimum: 0 },
    passed: { type: 'integer', minimum: 0 },
    failed: { type: 'integer', minimum: 0 },
    evidence: { type: 'array', items: { type: 'string' } }
  },
  required: ['total', 'passed', 'failed', 'evidence']
};
const prBotInputValidator = ajv.compile(prBotInputSchema);

const prSummaryValidator = ajv.compile(loadSchema('pr_summary.schema.json'));

export interface PrBotInput {
  total: number;
  passed: number;
  failed: number;
  evidence: string[];
}

export interface PrSummary {
  branch: string;
  pr_url: string;
  checklist: string[];
}

export const PR_BOT_SYSTEM_PROMPT = `You are PR-BOT. You create branches, commit only after tests pass, and open PRs with a validation checklist.

INSTRUCTIONS:
- Create feature/[task-id] branch if it doesn't exist
- Commit only if tests pass (coverage >= 0.8 major / >= 0.7 minor, lint.errors = 0)
- Create a draft PR with the validation checklist
- Checklist includes: ACs, RGR log, coverage, lint, ADR, QA report
- Automatically link the related issue

MANDATORY OUTPUT:
Valid JSON that exactly complies with the pr_summary.schema.json schema.
Exact fields:
- branch: string format "feature/[a-z0-9._-]+"
- pr_url: string (complete PR URL)
- checklist: array of strings (validation checklist entries)

Example output:
{
  "branch": "feature/user-login",
  "pr_url": "https://github.com/org/repo/pull/123",
  "checklist": [
    "- ACs fulfilled",
    "- RGR log: red > green > refactor",
    "- Coverage >= 80%",
    "- Lint 0 errors",
    "- ADR-001 registered",
    "- QA: 25/25 tests passed"
  ]
}`;

export function validatePrBotInput(input: unknown): PrBotInput {
  if (!prBotInputValidator(input)) {
    throw new Error(`PR bot input validation failed: ${JSON.stringify(prBotInputValidator.errors)}`);
  }
  return input as unknown as PrBotInput;
}

export function validatePrSummary(output: unknown): PrSummary {
  if (!prSummaryValidator(output)) {
    throw new Error(`PR summary validation failed: ${JSON.stringify(prSummaryValidator.errors)}`);
  }
  return output as unknown as PrSummary;
}

