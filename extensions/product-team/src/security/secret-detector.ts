const REDACTED_VALUE = '[REDACTED]';

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{80,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
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
  const stack: Array<{ value: unknown; path: string }> = [
    { value, path: currentPath },
  ];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const currentValue = frame.value;
    const path = frame.path;

    if (typeof currentValue === 'string') {
      if (containsSecret(currentValue)) {
        out.push(path);
      }
      continue;
    }

    if (Array.isArray(currentValue)) {
      for (let index = currentValue.length - 1; index >= 0; index -= 1) {
        stack.push({ value: currentValue[index], path: pathFor(path, index) });
      }
      continue;
    }

    if (!isRecord(currentValue)) {
      continue;
    }

    const entries = Object.entries(currentValue);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, nested] = entries[index];
      const nestedPath = pathFor(path, key);
      if (shouldRedactKeyValue(key, nested)) {
        out.push(nestedPath);
        continue;
      }
      stack.push({ value: nested, path: nestedPath });
    }
  }
}

function scrubValue(key: string | null, value: unknown): unknown {
  type Container = Record<string, unknown> | unknown[];
  interface ScrubFrame {
    source: unknown;
    keyContext: string | null;
    parent: Container | null;
    parentKey: string | number | null;
  }

  const stack: ScrubFrame[] = [
    { source: value, keyContext: key, parent: null, parentKey: null },
  ];
  let rootResult: unknown = value;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const { source, keyContext, parent, parentKey } = frame;

    let sanitized: unknown;
    if (typeof source === 'string') {
      sanitized =
        (keyContext !== null && SECRET_KEY_HINT.test(keyContext)) || containsSecret(source)
          ? REDACTED_VALUE
          : source;
    } else if (Array.isArray(source)) {
      const next: unknown[] = new Array(source.length);
      sanitized = next;
      for (let index = source.length - 1; index >= 0; index -= 1) {
        stack.push({
          source: source[index],
          keyContext,
          parent: next,
          parentKey: index,
        });
      }
    } else if (isRecord(source)) {
      const next: Record<string, unknown> = {};
      sanitized = next;
      const entries = Object.entries(source);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [nestedKey, nestedValue] = entries[index];
        stack.push({
          source: nestedValue,
          keyContext: nestedKey,
          parent: next,
          parentKey: nestedKey,
        });
      }
    } else {
      sanitized = source;
    }

    if (parent === null || parentKey === null) {
      rootResult = sanitized;
      continue;
    }
    (parent as Record<string | number, unknown>)[parentKey] = sanitized;
  }

  return rootResult;
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
