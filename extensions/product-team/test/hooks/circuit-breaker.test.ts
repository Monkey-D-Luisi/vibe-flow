import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleCircuitBreaker,
  getCircuitState,
  resetAllCircuits,
  type CircuitBreakerConfig,
} from '../../src/hooks/circuit-breaker.js';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxConsecutiveFailures: 3,
  trackedTools: ['quality_tests', 'quality_lint', 'quality_coverage', 'quality_gate'],
  cooldownMs: 60_000,
};

function createLogger() {
  const logs: string[] = [];
  const warns: string[] = [];
  return {
    info: (msg: string) => logs.push(msg),
    warn: (msg: string) => warns.push(msg),
    logs,
    warns,
  };
}

describe('circuit-breaker', () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  it('should not track unmonitored tools', () => {
    const logger = createLogger();
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'task_create', error: new Error('fail') },
      { agentId: 'back-1' },
      logger,
    );
    expect(getCircuitState('back-1')).toBeUndefined();
  });

  it('should increment failure count on tracked tool failure', () => {
    const logger = createLogger();
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', error: new Error('tests failed') },
      { agentId: 'back-1' },
      logger,
    );
    const state = getCircuitState('back-1');
    expect(state).toBeDefined();
    expect(state!.failureCount).toBe(1);
    expect(state!.tripped).toBe(false);
  });

  it('should reset counter on success', () => {
    const logger = createLogger();
    // Fail twice
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', error: new Error('fail 1') },
      { agentId: 'back-1' },
      logger,
    );
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_lint', error: new Error('fail 2') },
      { agentId: 'back-1' },
      logger,
    );
    expect(getCircuitState('back-1')!.failureCount).toBe(2);

    // Succeed
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', result: { passed: true } },
      { agentId: 'back-1' },
      logger,
    );
    expect(getCircuitState('back-1')!.failureCount).toBe(0);
    expect(getCircuitState('back-1')!.tripped).toBe(false);
  });

  it('should trip after maxConsecutiveFailures', () => {
    const logger = createLogger();
    for (let i = 0; i < 3; i++) {
      handleCircuitBreaker(
        DEFAULT_CONFIG,
        { toolName: 'quality_tests', error: new Error(`fail ${i}`) },
        { agentId: 'qa' },
        logger,
      );
    }
    const state = getCircuitState('qa');
    expect(state!.tripped).toBe(true);
    expect(state!.trippedAt).not.toBeNull();
    expect(logger.warns.some((w) => w.includes('TRIPPED'))).toBe(true);
  });

  it('should not trip again after already tripped', () => {
    const logger = createLogger();
    for (let i = 0; i < 5; i++) {
      handleCircuitBreaker(
        DEFAULT_CONFIG,
        { toolName: 'quality_lint', error: new Error(`fail ${i}`) },
        { agentId: 'back-1' },
        logger,
      );
    }
    // Should only see one TRIPPED message
    const trippedMessages = logger.warns.filter((w) => w.includes('TRIPPED'));
    expect(trippedMessages.length).toBe(1);
  });

  it('should track different agents independently', () => {
    const logger = createLogger();
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', error: new Error('fail') },
      { agentId: 'back-1' },
      logger,
    );
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', error: new Error('fail') },
      { agentId: 'front-1' },
      logger,
    );
    expect(getCircuitState('back-1')!.failureCount).toBe(1);
    expect(getCircuitState('front-1')!.failureCount).toBe(1);
  });

  it('should auto-reset after cooldown', () => {
    const logger = createLogger();
    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      handleCircuitBreaker(
        { ...DEFAULT_CONFIG, cooldownMs: 0 },
        { toolName: 'quality_tests', error: new Error(`fail ${i}`) },
        { agentId: 'qa' },
        logger,
      );
    }
    expect(getCircuitState('qa')!.tripped).toBe(true);

    // Next call with cooldownMs=0 should auto-reset
    handleCircuitBreaker(
      { ...DEFAULT_CONFIG, cooldownMs: 0 },
      { toolName: 'quality_tests', error: new Error('after cooldown') },
      { agentId: 'qa' },
      logger,
    );
    // After auto-reset, failure count starts at 1 (this new failure)
    expect(getCircuitState('qa')!.failureCount).toBe(1);
    expect(logger.logs.some((l) => l.includes('auto-reset'))).toBe(true);
  });

  it('should use "unknown" when agentId is not provided', () => {
    const logger = createLogger();
    handleCircuitBreaker(
      DEFAULT_CONFIG,
      { toolName: 'quality_tests', error: new Error('fail') },
      {},
      logger,
    );
    expect(getCircuitState('unknown')!.failureCount).toBe(1);
  });
});
