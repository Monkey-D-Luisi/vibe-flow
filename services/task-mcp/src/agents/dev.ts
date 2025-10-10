import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

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

// Output schema validation
const devWorkOutputSchema = require('../../../packages/schemas/dev_work_output.schema.json');
const devWorkOutputValidator = ajv.compile(devWorkOutputSchema);

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

export const DEV_SYSTEM_PROMPT = `Eres el agente DEV. Escribe primero tests (TDD), luego implementación. No inventes campos.

INSTRUCCIONES:
- Aplica TDD: primero tests rojos, luego implementación verde, refactor
- Sigue SOLID y Clean Code (funciones pequeñas, nombres descriptivos)
- Implementa contratos definidos por arquitectura
- Aplica patrones especificados donde corresponda
- Asegura coverage ≥ 0.8 (major) | ≥ 0.7 (minor)
- Mantén lint.errors = 0
- Registra al menos 2 entradas en red_green_refactor_log

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema dev_work_output.schema.json.
Campos exactos:
- diff_summary: string (resumen de cambios)
- metrics: {coverage: number 0-1, lint: {errors: number, warnings: number}}
- red_green_refactor_log: array de strings (mínimo 2 entradas)

Ejemplo de salida:
{
  "diff_summary": "Added UserService with TDD, implemented Repository pattern",
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