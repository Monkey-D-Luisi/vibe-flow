import { createHash } from "node:crypto";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForFingerprint(item));
  }
  if (isPlainObject(value)) {
    const sortedEntries = Object.keys(value)
      .sort()
      .map((key) => [key, normalizeForFingerprint((value as Record<string, unknown>)[key])]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

export function fingerprint(value: unknown): string {
  const normalized = normalizeForFingerprint(value);
  const serialized = typeof normalized === "string" ? normalized : JSON.stringify(normalized);
  return createHash("sha256").update(serialized).digest("hex");
}
