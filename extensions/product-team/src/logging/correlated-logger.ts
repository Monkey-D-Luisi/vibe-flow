import { scrubSecrets } from '../security/secret-detector.js';

export interface CorrelatedLogger {
  debug(op: string, context?: Record<string, unknown>): void;
  info(op: string, context?: Record<string, unknown>): void;
  warn(op: string, context?: Record<string, unknown>): void;
  error(op: string, context?: Record<string, unknown>): void;
}

export interface CorrelatedLoggerDefaults {
  readonly agentId?: string;
  readonly taskId?: string;
}

export interface CorrelatedBaseLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
  readonly debug?: (message: string) => void;
}

interface LogPayload extends Record<string, unknown> {
  readonly ts: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly correlationId: string;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly op: string;
}

function makePayload(
  level: LogPayload['level'],
  correlationId: string,
  defaults: CorrelatedLoggerDefaults | undefined,
  op: string,
  context: Record<string, unknown> | undefined,
): string {
  const payload: LogPayload = {
    ts: new Date().toISOString(),
    level,
    correlationId,
    agentId: defaults?.agentId,
    taskId: defaults?.taskId,
    op,
    ...(context ?? {}),
  };
  return JSON.stringify(scrubSecrets(payload));
}

export function createCorrelatedLogger(
  baseLogger: CorrelatedBaseLogger,
  correlationId: string,
  defaults?: CorrelatedLoggerDefaults,
): CorrelatedLogger {
  return {
    debug(op, context) {
      const message = makePayload('debug', correlationId, defaults, op, context);
      if (baseLogger.debug) {
        baseLogger.debug(message);
      } else {
        baseLogger.info(message);
      }
    },
    info(op, context) {
      baseLogger.info(makePayload('info', correlationId, defaults, op, context));
    },
    warn(op, context) {
      baseLogger.warn(makePayload('warn', correlationId, defaults, op, context));
    },
    error(op, context) {
      baseLogger.error(makePayload('error', correlationId, defaults, op, context));
    },
  };
}
