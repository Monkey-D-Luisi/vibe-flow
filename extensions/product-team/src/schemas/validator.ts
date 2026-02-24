import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import { ValidationError } from '../domain/errors.js';

export type ValidateFn = <T>(schema: TSchema, data: unknown) => T;

const cache = new Map<TSchema, TypeCheck<TSchema>>();

function getCompiled(schema: TSchema): TypeCheck<TSchema> {
  let compiled = cache.get(schema);
  if (!compiled) {
    compiled = TypeCompiler.Compile(schema);
    cache.set(schema, compiled);
  }
  return compiled;
}

export function createValidator(): ValidateFn {
  return function validate<T>(schema: TSchema, data: unknown): T {
    const compiled = getCompiled(schema);
    if (!compiled.Check(data)) {
      const errors = [...compiled.Errors(data)];
      const message = errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ');
      throw new ValidationError(message);
    }
    return data as T;
  };
}
