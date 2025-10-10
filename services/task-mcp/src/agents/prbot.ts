import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

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

// Output schema validation
const prSummarySchema = require('../../../packages/schemas/pr_summary.schema.json');
const prSummaryValidator = ajv.compile(prSummarySchema);

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

export const PR_BOT_SYSTEM_PROMPT = `Eres PR-BOT. Creas rama, commits gated por tests, y PR con checklist de validación.

INSTRUCCIONES:
- Crea rama feature/[task-id] si no existe
- Commits solo si tests pasan (coverage ≥ 0.8 major / ≥ 0.7 minor, lint.errors = 0)
- Crea PR draft con checklist completo
- Checklist incluye: ACs, RGR log, cobertura, lint, ADR, QA report
- Enlaza issue automáticamente

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema pr_summary.schema.json.
Campos exactos:
- branch: string formato "feature/[a-z0-9._-]+"
- pr_url: string (URL completa del PR)
- checklist: array de strings (items de validación marcados)

Ejemplo de salida:
{
  "branch": "feature/user-login",
  "pr_url": "https://github.com/org/repo/pull/123",
  "checklist": [
    "✅ ACs cumplidos",
    "✅ RGR log: red→green→refactor",
    "✅ Cobertura ≥ 80%",
    "✅ Lint 0 errores",
    "✅ ADR-001 registrado",
    "✅ QA: 25/25 tests pasaron"
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