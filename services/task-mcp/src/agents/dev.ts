import Ajv from 'ajv';
import { loadSchema } from '../utils/loadSchema.js';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });

// Input schema for dev agent (uses design ready)
const devInputSchema = {
  type: 'object',
  properties: {
    modules: { type: 'array', items: { type: 'string' } },
    contracts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          methods: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'methods']
      }
    },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          where: { type: 'string' },
          why: { type: 'string' }
        },
        required: ['name', 'where', 'why']
      }
    },
    adr_id: { type: 'string' },
    test_plan: { type: 'array', items: { type: 'string' } }
  },
  required: ['modules', 'contracts', 'patterns', 'adr_id', 'test_plan']
};
const devInputValidator = ajv.compile(devInputSchema);

const devWorkOutputValidator = ajv.compile(loadSchema('dev_work_output.schema.json'));

export interface DevInput {
  modules: string[];
  contracts: Array<{
    name: string;
    methods: string[];
  }>;
  patterns: Array<{
    name: string;
    where: string;
    why: string;
  }>;
  adr_id: string;
  test_plan: string[];
}

export interface DevWorkOutput {
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

export const DEV_SYSTEM_PROMPT = `You are the DEV agent. Write tests first (TDD), then implementation. Do not invent fields.

INSTRUCTIONS:
- Apply TDD: first red tests, then green implementation, refactor
- Follow SOLID and Clean Code (small functions, descriptive names)
- Implement contracts defined by architecture
- Apply specified patterns where appropriate
- Ensure coverage >= 0.8 (major) | >= 0.7 (minor)
- Keep lint.errors = 0
- Record at least 2 entries in red_green_refactor_log

MANDATORY OUTPUT:
Valid JSON that exactly complies with the dev_work_output.schema.json schema.
Exact fields:
- diff_summary: string (summary of changes)
- metrics: {coverage: number 0-1, lint: {errors: number, warnings: number}}
- red_green_refactor_log: array of strings (minimum 2 entries)

Example output:
{
  "diff_summary": "Added UserService with TDD",
  "metrics": {
    "coverage": 0.85,
    "lint": {"errors": 0, "warnings": 2}
  },
  "red_green_refactor_log": [
    "RED: UserService.findById test fails",
    "GREEN: Implemented UserService.findById",
    "REFACTOR: Extracted interface"
  ]
}`;

export function validateDevInput(input: unknown): DevInput {
  if (!devInputValidator(input)) {
    throw new Error(`Dev input validation failed: ${JSON.stringify(devInputValidator.errors)}`);
  }
  return input as unknown as DevInput;
}

export function validateDevWorkOutput(output: unknown): DevWorkOutput {
  if (!devWorkOutputValidator(output)) {
    throw new Error(`Dev work output validation failed: ${JSON.stringify(devWorkOutputValidator.errors)}`);
  }
  return output as unknown as DevWorkOutput;
}
