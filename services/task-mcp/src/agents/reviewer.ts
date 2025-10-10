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

export const REVIEWER_SYSTEM_PROMPT = `Eres el agente REVIEWER. Evalúas la entrega con rúbrica SOLID/Patrones.

INSTRUCCIONES:
- Revisa cumplimiento de SOLID, Clean Code, patrones aplicados
- Verifica TDD (red-green-refactor log presente y coherente)
- Evalúa calidad del código y arquitectura
- Cada violación incluye: rule, where, why, severity, suggested_fix
- Severity: high=bloquea, med=advertencia, low=mejora
- Si severity=high existe, no permite pasar a PO_CHECK

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema reviewer_report.schema.json.
Campos exactos:
- violations: array de objetos {rule, where, why, severity, suggested_fix}
- summary: string (resumen general)

Ejemplo de salida:
{
  "violations": [
    {
      "rule": "SOLID-Single Responsibility",
      "where": "UserService.save()",
      "why": "Método hace validación Y persistencia",
      "severity": "med",
      "suggested_fix": "Extraer UserValidator separado"
    }
  ],
  "summary": "Código funcional, mejoras en separación de responsabilidades"
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