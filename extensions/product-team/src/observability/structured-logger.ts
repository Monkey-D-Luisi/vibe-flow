/**
 * Structured Logger (EP14, Task 0102)
 *
 * Factory that wraps an existing logger with structured JSON output.
 * Produces machine-parseable log lines for observability pipelines.
 *
 * Output format: {"ts":"...","level":"info","ext":"product-team","op":"plugin.loaded",...}
 */

interface BaseLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface StructuredLogger {
  readonly info: (op: string, ctx?: Record<string, unknown>) => void;
  readonly warn: (op: string, ctx?: Record<string, unknown>) => void;
  readonly error: (op: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Create a structured logger that wraps an existing logger.
 *
 * @param base - The underlying logger (e.g. api.logger)
 * @param ext - Extension name (e.g. 'product-team', 'model-router')
 * @returns A StructuredLogger that outputs JSON to the base logger
 */
export function createStructuredLogger(base: BaseLogger, ext: string): StructuredLogger {
  function format(level: string, op: string, ctx?: Record<string, unknown>): string {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level,
      ext,
      op,
      ...ctx,
    });
  }

  return {
    info: (op, ctx) => base.info(format('info', op, ctx)),
    warn: (op, ctx) => base.warn(format('warn', op, ctx)),
    error: (op, ctx) => base.error(format('error', op, ctx)),
  };
}

/**
 * Inline structured log helper for extensions that cannot import from product-team.
 * Copy this 3-line pattern into each extension's register() function.
 *
 * Usage:
 * ```typescript
 * const slog = (level: 'info' | 'warn' | 'error', op: string, ctx?: Record<string, unknown>) =>
 *   logger[level](JSON.stringify({ ts: new Date().toISOString(), level, ext: 'EXT_NAME', op, ...ctx }));
 * ```
 */
