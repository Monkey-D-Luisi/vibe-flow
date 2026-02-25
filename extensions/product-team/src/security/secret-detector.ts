const REDACTED_VALUE = '[REDACTED]';

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{80,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
  /\b(?:password|passwd|token|secret|api[_-]?key)\b\s*[:=]\s*\S{8,}/i,
];

const SECRET_KEY_HINT = /(password|passwd|token|secret|api[_-]?key|private[_-]?key)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathFor(parent: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${parent}[${key}]`;
  }
  return parent.length === 0 ? key : `${parent}.${key}`;
}

function shouldRedactKeyValue(key: string, value: unknown): boolean {
  return SECRET_KEY_HINT.test(key) && typeof value === 'string' && value.trim().length > 0;
}

function collectSecretPaths(
  value: unknown,
  currentPath: string,
  out: string[],
): void {
  if (typeof value === 'string') {
    if (containsSecret(value)) {
      out.push(currentPath);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectSecretPaths(value[index], pathFor(currentPath, index), out);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = pathFor(currentPath, key);
    if (shouldRedactKeyValue(key, nested)) {
      out.push(nestedPath);
      continue;
    }
    collectSecretPaths(nested, nestedPath, out);
  }
}

function scrubValue(key: string | null, value: unknown): unknown {
  if (typeof value === 'string') {
    if ((key !== null && SECRET_KEY_HINT.test(key)) || containsSecret(value)) {
      return REDACTED_VALUE;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(key, item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    result[nestedKey] = scrubValue(nestedKey, nestedValue);
  }
  return result;
}

export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateMetadataNoSecrets(
  metadata: Record<string, unknown>,
): string[] {
  const paths: string[] = [];
  collectSecretPaths(metadata, 'metadata', paths);
  return paths;
}

export function scrubSecrets<T>(value: T): T {
  return scrubValue(null, value) as T;
}

export { REDACTED_VALUE };
