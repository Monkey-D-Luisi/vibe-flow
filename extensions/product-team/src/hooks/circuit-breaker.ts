/**
 * Circuit Breaker Hook
 *
 * Monitors consecutive failures of quality tools per agent and trips
 * the circuit when the threshold is reached, preventing infinite
 * retry loops.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

export interface CircuitBreakerConfig {
  /** Maximum consecutive failures before tripping. Default: 3 */
  readonly maxConsecutiveFailures: number;
  /** Tool names to monitor. */
  readonly trackedTools: readonly string[];
  /** Cooldown in ms before the circuit resets automatically. Default: 60_000 */
  readonly cooldownMs: number;
}

export interface CircuitBreakerState {
  failureCount: number;
  lastTool: string;
  lastError: string;
  tripped: boolean;
  trippedAt: number | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxConsecutiveFailures: 3,
  trackedTools: [
    'quality_tests',
    'quality_lint',
    'quality_coverage',
    'quality_gate',
    'qgate_tests',
    'qgate_lint',
    'qgate_coverage',
    'qgate_gate',
  ],
  cooldownMs: 60_000,
};

/** Per-agent circuit state. */
const agentCircuits = new Map<string, CircuitBreakerState>();

/** @internal Exposed for testing. */
export function getCircuitState(agentId: string): CircuitBreakerState | undefined {
  return agentCircuits.get(agentId);
}

/** @internal Exposed for testing. */
export function resetAllCircuits(): void {
  agentCircuits.clear();
}

function getOrCreateState(agentId: string): CircuitBreakerState {
  let state = agentCircuits.get(agentId);
  if (!state) {
    state = { failureCount: 0, lastTool: '', lastError: '', tripped: false, trippedAt: null };
    agentCircuits.set(agentId, state);
  }
  return state;
}

interface CircuitBreakerLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

/**
 * Process an after_tool_call event for circuit breaker logic.
 *
 * - If the tool is tracked and failed, increment the agent's failure counter.
 * - If the counter reaches the threshold, trip the circuit.
 * - If the tool succeeds, reset the counter.
 * - If the circuit is tripped but cooldown has elapsed, auto-reset.
 */
export function handleCircuitBreaker(
  config: CircuitBreakerConfig,
  event: { toolName: string; error?: unknown; result?: unknown },
  ctx: { agentId?: string },
  logger: CircuitBreakerLogger,
): void {
  const agentId = ctx.agentId ?? 'unknown';

  // Only track configured tools
  if (!config.trackedTools.includes(event.toolName)) return;

  const state = getOrCreateState(agentId);

  // Auto-reset if cooldown has elapsed
  if (state.tripped && state.trippedAt !== null) {
    if (Date.now() - state.trippedAt >= config.cooldownMs) {
      logger.info(`circuit-breaker: auto-reset for "${agentId}" after cooldown`);
      state.failureCount = 0;
      state.tripped = false;
      state.trippedAt = null;
    }
  }

  // Tool succeeded → reset counter
  if (!event.error) {
    if (state.failureCount > 0) {
      logger.info(
        `circuit-breaker: "${agentId}" succeeded on ${event.toolName}, resetting counter (was ${state.failureCount})`,
      );
    }
    state.failureCount = 0;
    state.tripped = false;
    state.trippedAt = null;
    return;
  }

  // Tool failed → increment counter
  state.failureCount++;
  state.lastTool = event.toolName;
  state.lastError = String(event.error);

  logger.warn(
    `circuit-breaker: "${agentId}" failed ${event.toolName} ` +
    `(${state.failureCount}/${config.maxConsecutiveFailures})`,
  );

  // Trip the circuit if threshold reached
  if (state.failureCount >= config.maxConsecutiveFailures && !state.tripped) {
    state.tripped = true;
    state.trippedAt = Date.now();
    logger.warn(
      `circuit-breaker: TRIPPED for "${agentId}" after ${state.failureCount} consecutive failures ` +
      `on ${state.lastTool}. Last error: ${state.lastError.slice(0, 200)}. ` +
      `Agent should change approach or escalate. Will auto-reset after ${config.cooldownMs}ms.`,
    );
  }
}

/**
 * Register the circuit breaker as an after_tool_call hook.
 */
export function registerCircuitBreakerHook(
  api: OpenClawPluginApi,
  config?: Partial<CircuitBreakerConfig>,
): void {
  const resolvedConfig: CircuitBreakerConfig = {
    maxConsecutiveFailures:
      config?.maxConsecutiveFailures ?? DEFAULT_CONFIG.maxConsecutiveFailures,
    trackedTools: config?.trackedTools ?? DEFAULT_CONFIG.trackedTools,
    cooldownMs: config?.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
  };

  api.on('after_tool_call', (event, ctx) => {
    try {
      handleCircuitBreaker(resolvedConfig, event, ctx, api.logger);
    } catch (err: unknown) {
      api.logger.warn(`circuit-breaker: unhandled error: ${String(err)}`);
    }
  });

  api.logger.info(
    `registered circuit-breaker hook (threshold: ${resolvedConfig.maxConsecutiveFailures}, ` +
    `tracked: ${resolvedConfig.trackedTools.length} tools)`,
  );
}
