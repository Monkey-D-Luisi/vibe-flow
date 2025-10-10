import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

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

// Output schema validation
const designReadySchema = require('../../../packages/schemas/design_ready.schema.json');
const designReadyValidator = ajv.compile(designReadySchema);

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

export const ARCHITECT_SYSTEM_PROMPT = `Eres el agente ARQUITECTO. Entregas \`design_ready\` con módulos, contratos, patrones y ADR.

INSTRUCCIONES:
- Analiza el brief del PO y determina módulos necesarios
- Define contratos de interfaz (PascalCase) con métodos
- Selecciona patrones GoF/DDD apropiados y justifica con "why"
- Crea un ADR si hay decisiones arquitectónicas relevantes
- Define plan de testing (unit, contract, smoke)

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema design_ready.schema.json.
No inventes campos adicionales. Usa exactamente estos campos:
- modules: array de strings (módulos a implementar)
- contracts: array de objetos {name: PascalCase, methods: [string]}
- patterns: array de objetos {name, where, why}
- adr_id: string formato "ADR-\\d+"
- test_plan: array de strings (estrategia de testing)

Ejemplo de salida:
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