import Ajv from 'ajv';
import designReadySchema from '../../../packages/schemas/design_ready.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });

// Input schema for architect agent (uses PO brief)
const architectInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
    scope: { type: 'string', enum: ['minor', 'major'] },
    non_functional: { type: 'array', items: { type: 'string' } },
    done_if: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
};
const architectInputValidator = ajv.compile(architectInputSchema);

const designReadyValidator = ajv.compile(designReadySchema as Record<string, unknown>);

export interface ArchitectInput {
  title: string;
  acceptance_criteria: string[];
  scope: 'minor' | 'major';
  non_functional: string[];
  done_if: string[];
}

export interface DesignReady {
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

export const ARCHITECT_SYSTEM_PROMPT = `You are the ARCHITECT agent. You deliver \`design_ready\` with modules, contracts, patterns, and ADR.

INSTRUCTIONS:
- Analyze the PO brief and determine necessary modules
- Define interface contracts (PascalCase) with methods
- Select appropriate GoF/DDD patterns and justify with "why"
- Create an ADR if there are relevant architectural decisions
- Define testing plan (unit, contract, smoke)

MANDATORY OUTPUT:
Valid JSON that exactly complies with the design_ready.schema.json schema.
Do not invent additional fields. Use exactly these fields:
- modules: array of strings (modules to implement)
- contracts: array of objects {name: PascalCase, methods: [string]}
- patterns: array of objects {name, where, why}
- adr_id: string format "ADR-\\d+"
- test_plan: array of strings (testing strategy)

Example output:
{
  "modules": ["UserService", "AuthModule"],
  "contracts": [{"name": "UserRepository", "methods": ["findById", "save"]}],
  "patterns": [{"name": "Repository", "where": "data access", "why": "abstraction over persistence"}],
  "adr_id": "ADR-001",
  "test_plan": ["Unit tests for all services", "Contract tests for APIs"]
}`;

export function validateArchitectInput(input: unknown): ArchitectInput {
  if (!architectInputValidator(input)) {
    throw new Error(`Architect input validation failed: ${JSON.stringify(architectInputValidator.errors)}`);
  }
  return input as unknown as ArchitectInput;
}

export function validateDesignReady(output: unknown): DesignReady {
  if (!designReadyValidator(output)) {
    throw new Error(`Design ready validation failed: ${JSON.stringify(designReadyValidator.errors)}`);
  }
  return output as unknown as DesignReady;
}
