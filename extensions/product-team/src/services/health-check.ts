import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly checks: {
    readonly gateway: boolean;
    readonly database: boolean;
    readonly llmProvider: boolean;
    readonly telegram: boolean;
    readonly eventLog: boolean;
  };
  readonly timestamp: string;
}

export interface HealthCheckDeps {
  readonly db: Database.Database;
  readonly pluginConfig: Record<string, unknown> | undefined;
  readonly eventLogWritable: () => boolean;
}

function isLlmProviderConfigured(pluginConfig: Record<string, unknown> | undefined): boolean {
  if (!pluginConfig) {
    return false;
  }
  const envKeys = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_AI_API_KEY',
  ];
  for (const key of envKeys) {
    const val = process.env[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return true;
    }
  }
  // Also check pluginConfig.models / pluginConfig.providers
  const providers = pluginConfig['providers'];
  if (Array.isArray(providers) && providers.length > 0) {
    return true;
  }
  return false;
}

function isTelegramConfigured(): boolean {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  return typeof token === 'string' && token.trim().length > 0;
}

function checkDatabase(db: Database.Database): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

function checkEventLog(eventLogWritable: () => boolean): boolean {
  try {
    return eventLogWritable();
  } catch {
    return false;
  }
}

function computeStatus(checks: HealthCheckResult['checks']): HealthStatus {
  if (!checks.database || !checks.gateway) {
    return 'down';
  }
  if (!checks.llmProvider || !checks.eventLog) {
    return 'degraded';
  }
  return 'ok';
}

export function createHealthCheckHandler(
  deps: HealthCheckDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // Optional bearer-token auth: if HEALTH_CHECK_SECRET is set, enforce it.
    const secret = process.env['HEALTH_CHECK_SECRET'];
    if (secret) {
      const auth = (req.headers as Record<string, string>)['authorization'] ?? '';
      const expected = `Bearer ${secret}`;
      const authBuf = Buffer.from(auth);
      const expectedBuf = Buffer.from(expected);
      if (authBuf.length !== expectedBuf.length || !timingSafeEqual(authBuf, expectedBuf)) {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
    }

    const result = getHealthStatus(deps);
    const statusCode = result.status === 'down' ? 503 : 200;
    res.statusCode = statusCode;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result));
  };
}

export function getHealthStatus(deps: HealthCheckDeps): HealthCheckResult {
  const dbOk = checkDatabase(deps.db);
  const eventLogOk = checkEventLog(deps.eventLogWritable);
  const llmOk = isLlmProviderConfigured(deps.pluginConfig);
  const telegramOk = isTelegramConfigured();

  const checks: HealthCheckResult['checks'] = {
    gateway: true,
    database: dbOk,
    llmProvider: llmOk,
    telegram: telegramOk,
    eventLog: eventLogOk,
  };
  const status = computeStatus(checks);

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
