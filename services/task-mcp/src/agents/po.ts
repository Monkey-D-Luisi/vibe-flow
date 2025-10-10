import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

// Input schema for PO agent
const poInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
    scope: { type: 'string', enum: ['minor', 'major'] },
    constraints: {
      type: 'object',
      properties: {
        security: { type: 'array', items: { type: 'string' } },
        performance: { type: 'array', items: { type: 'string' } },
        privacy: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  required: ['title', 'description', 'acceptance_criteria', 'scope']
};
// Input validation
const poInputValidator = ajv.compile(poInputSchema);

// Output schema validation
const poBriefSchema = require('../../../packages/schemas/po_brief.schema.json');
const poBriefValidator = ajv.compile(poBriefSchema);

export interface PoInput {
  title: string;
  description: string;
  acceptance_criteria: string[];
  scope: 'minor' | 'major';
  constraints?: {
    security?: string[];
    performance?: string[];
    privacy?: string[];
  };
}

export interface PoBrief {
  title: string;
  acceptance_criteria: string[];
  scope: 'minor' | 'major';
  non_functional: string[];
  done_if: string[];
}

export const PO_SYSTEM_PROMPT = `You are the PO agent (Product Owner). Your goal is to distill clear requirements and actionable acceptance criteria from the user's input.

INSTRUCTIONS:
- Analyze the provided title, description, and acceptance criteria
- Determine the scope (minor/major) based on complexity and impact
- Extract non-functional constraints for security, performance, and privacy
- Define clear "done" criteria based on the acceptance criteria
- Keep the original provided scope

MANDATORY OUTPUT:
Valid JSON that exactly complies with the po_brief.schema.json schema.
Do not invent additional fields. Use exactly these fields:
- title: string (the original title)
- acceptance_criteria: array of strings (the provided criteria)
- scope: "minor" | "major" (the provided scope)
- non_functional: array of strings (extracted constraints)
- done_if: array of strings (actionable completion criteria)

Example output:
{
  "title": "Implement user login",
  "acceptance_criteria": ["User can log in", "Password is encrypted"],
  "scope": "minor",
  "non_functional": ["Security: AES-256 encryption", "Performance: response < 2s"],
  "done_if": ["Login works in browser", "Security tests pass"]
}`;

export function validatePoInput(input: unknown): PoInput {
  if (!poInputValidator(input)) {
    throw new Error(`PO input validation failed: ${JSON.stringify(poInputValidator.errors)}`);
  }
  return input as unknown as PoInput;
}

export function validatePoBrief(output: unknown): PoBrief {
  if (!poBriefValidator(output)) {
    throw new Error(`PO brief validation failed: ${JSON.stringify(poBriefValidator.errors)}`);
  }
  return output as unknown as PoBrief;
}