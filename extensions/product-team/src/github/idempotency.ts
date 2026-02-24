import { createHash } from 'node:crypto';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStableJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toStableJson(item));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, toStableJson(item)] as const);
    return Object.fromEntries(entries);
  }

  return String(value);
}

export function computePayloadHash(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(toStableJson(payload));
  return createHash('sha256').update(serialized).digest('hex');
}

export interface IdempotentResult<TResult> {
  readonly result: TResult;
  readonly cached: boolean;
}

export interface IdempotencyDeps {
  readonly requestRepo: SqliteRequestRepository;
  readonly generateId: () => string;
  readonly now: () => string;
}

export interface WithIdempotencyInput<TResult> {
  readonly taskId: string;
  readonly tool: string;
  readonly payload: Record<string, unknown>;
  readonly deps: IdempotencyDeps;
  readonly execute: () => Promise<TResult>;
}

function parseResponse<TResult>(raw: string): TResult {
  return JSON.parse(raw) as TResult;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /UNIQUE constraint failed/.test(error.message);
}

export async function withIdempotency<TResult>(
  input: WithIdempotencyInput<TResult>,
): Promise<IdempotentResult<TResult>> {
  const payloadHash = computePayloadHash(input.payload);

  const existing = input.deps.requestRepo.findByPayloadHash(input.tool, payloadHash);
  if (existing) {
    return {
      result: parseResponse<TResult>(existing.response),
      cached: true,
    };
  }

  const result = await input.execute();
  const serialized = JSON.stringify(result);

  try {
    input.deps.requestRepo.insert({
      requestId: input.deps.generateId(),
      taskId: input.taskId,
      tool: input.tool,
      payloadHash,
      response: serialized,
      createdAt: input.deps.now(),
    });
    return { result, cached: false };
  } catch (error: unknown) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const cached = input.deps.requestRepo.findByPayloadHash(input.tool, payloadHash);
    if (!cached) {
      throw error;
    }
    return {
      result: parseResponse<TResult>(cached.response),
      cached: true,
    };
  }
}
