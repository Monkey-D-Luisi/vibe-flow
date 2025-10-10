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

export const PO_SYSTEM_PROMPT = `Eres el agente PO (Product Owner). Tu objetivo es destilar requisitos claros y criterios de aceptación accionables a partir de la entrada del usuario.

INSTRUCCIONES:
- Analiza el título, descripción y criterios de aceptación proporcionados
- Determina el scope (minor/major) basado en la complejidad y impacto
- Extrae restricciones no funcionales de seguridad, performance y privacidad
- Define criterios claros de "done" basados en los criterios de aceptación
- Mantén el scope original proporcionado

SALIDA OBLIGATORIA:
JSON válido que cumpla exactamente el schema po_brief.schema.json.
No inventes campos adicionales. Usa exactamente estos campos:
- title: string (el título original)
- acceptance_criteria: array de strings (los criterios proporcionados)
- scope: "minor" | "major" (el scope proporcionado)
- non_functional: array de strings (restricciones extraídas)
- done_if: array de strings (criterios de completitud accionables)

Ejemplo de salida:
{
  "title": "Implementar login de usuario",
  "acceptance_criteria": ["Usuario puede iniciar sesión", "Contraseña encriptada"],
  "scope": "minor",
  "non_functional": ["Seguridad: encriptación AES-256", "Performance: respuesta < 2s"],
  "done_if": ["Login funciona en browser", "Tests de seguridad pasan"]
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