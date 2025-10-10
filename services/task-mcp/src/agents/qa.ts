import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

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

// Output schema validation
const qaReportSchema = require('../../../packages/schemas/qa_report.schema.json');
const qaReportValidator = ajv.compile(qaReportSchema);

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

export const QA_SYSTEM_PROMPT = `Eres QA. Ejecutas plan unit/contract/smoke definido por arquitectura.

INSTRUCCIONES:
- Ejecuta tests unitarios, de contrato e integración
- Verifica que no hay violaciones de alta severidad
- Registra evidencia de ejecución (logs, screenshots, etc.)
- Si failed > 0, el QA falla y debe arreglarse antes de continuar
- Total = passed + failed

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema qa_report.schema.json.
Campos exactos:
- total: number (tests totales ejecutados)
- passed: number (tests que pasaron)
- failed: number (tests que fallaron)
- evidence: array de strings (evidencia de ejecución)

Ejemplo de salida:
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