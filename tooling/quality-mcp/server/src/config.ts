import { env } from 'node:process';

export interface ApiKeyConfig {
  key: string;
  scopes: Set<string>;
  hmacSecret?: string;
}

function parseScopes(value: string | undefined): Set<string> {
  if (!value) {
    return new Set(['run', 'read']);
  }
  return new Set(
    value
      .split('|')
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

function parseKeys(raw: string | undefined): Map<string, ApiKeyConfig> {
  const map = new Map<string, ApiKeyConfig>();
  if (!raw) {
    return map;
  }

  for (const entry of raw.split(',').map((token) => token.trim()).filter(Boolean)) {
    const [keyAndScopes, maybeSecret] = entry.split('@');
    const [key, scopesRaw] = keyAndScopes.split(':');
    if (!key) {
      continue;
    }
    map.set(key, {
      key,
      scopes: parseScopes(scopesRaw),
      hmacSecret: maybeSecret?.trim() || undefined
    });
  }
  return map;
}

function parseNumberEnv(name: string, fallback: number): number {
  const value = env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSizeEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(kb|mb|gb)?$/);
  if (!match) {
    const num = Number.parseInt(trimmed, 10);
    return Number.isFinite(num) ? num : fallback;
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'gb':
      return amount * 1024 * 1024 * 1024;
    case 'mb':
      return amount * 1024 * 1024;
    case 'kb':
      return amount * 1024;
    default:
      return amount;
  }
}

export const config = {
  port: parseNumberEnv('PORT', 8080),
  defaultTimeoutMs: parseNumberEnv('QUALITY_TOOL_TIMEOUT_MS', 600000),
  maxConcurrency: parseNumberEnv('QUALITY_MAX_CONCURRENCY', 2),
  rateLimitRps: parseNumberEnv('QUALITY_RPS', 2),
  rateLimitBurst: parseNumberEnv('QUALITY_BURST', 5),
  maxBodySize: parseSizeEnv(env.QUALITY_MAX_BODY_SIZE, 1024 * 1024),
  allowedOrigins: env.QUALITY_CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [],
  apiKeys: parseKeys(env.QUALITY_MCP_KEYS)
};

export type Config = typeof config;
