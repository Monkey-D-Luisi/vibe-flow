import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import { MESSAGE_SCHEMAS } from '../schemas/messages/index.js';

export interface MessageValidationResult {
  /** Whether the message body conforms to its schema. */
  readonly valid: boolean;
  /** Validation errors (only present when `valid` is false). */
  readonly errors?: readonly string[];
}

/** Cache of compiled TypeBox validators keyed by message type. */
const compiledChecks = new Map<string, TypeCheck<TSchema>>();

function getCompiledCheck(type: string): TypeCheck<TSchema> | undefined {
  const cached = compiledChecks.get(type);
  if (cached) return cached;

  const schema = MESSAGE_SCHEMAS.get(type);
  if (!schema) return undefined;

  const check = TypeCompiler.Compile(schema);
  compiledChecks.set(type, check);
  return check;
}

/**
 * Validate a message body against the schema registered for the given type.
 *
 * Returns `{ valid: true }` when:
 * - The body conforms to the schema for the given `type`.
 *
 * Returns `{ valid: false, errors: [...] }` when:
 * - The `type` is not recognized (unknown message type).
 * - The body does not conform to the schema.
 */
export function validateMessageBody(
  type: string,
  body: unknown,
): MessageValidationResult {
  const check = getCompiledCheck(type);
  if (!check) {
    return { valid: false, errors: [`Unknown message type: "${type}"`] };
  }

  if (check.Check(body)) {
    return { valid: true };
  }

  const errors = [...check.Errors(body)].map(
    (e) => `${e.path}: ${e.message}`,
  );
  return { valid: false, errors };
}
