/**
 * Runtime input validation helpers for quality-gate tool execute handlers.
 *
 * These assertion functions validate Record<string, unknown> inputs against
 * expected TypeScript types, throwing with an INVALID_INPUT prefix on failure.
 * This matches the input validation pattern used in product-team tools.
 */

export function assertOptionalString(value: unknown, field: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`INVALID_INPUT: ${field} must be a string, got ${typeof value}`);
  }
}

export function assertOptionalNumber(value: unknown, field: string): asserts value is number | undefined {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`INVALID_INPUT: ${field} must be a finite number, got ${String(value)}`);
  }
}

export function assertOptionalBoolean(value: unknown, field: string): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`INVALID_INPUT: ${field} must be a boolean, got ${typeof value}`);
  }
}

export function assertOptionalStringArray(value: unknown, field: string): asserts value is string[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`INVALID_INPUT: ${field} must be an array of strings`);
  }
}

export function assertOptionalStringEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): asserts value is T | undefined {
  if (value !== undefined && !allowed.includes(value as T)) {
    throw new Error(`INVALID_INPUT: ${field} must be one of [${allowed.join(', ')}], got ${String(value)}`);
  }
}

export function assertOptionalArray(value: unknown, field: string): asserts value is unknown[] | undefined {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error(`INVALID_INPUT: ${field} must be an array`);
  }
}

export function assertOptionalObject(value: unknown, field: string): asserts value is Record<string, unknown> | undefined {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new Error(`INVALID_INPUT: ${field} must be an object`);
  }
}
