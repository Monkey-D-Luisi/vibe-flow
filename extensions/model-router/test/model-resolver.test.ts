import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createModelResolver,
  DEFAULT_TIER_MAPPING,
  type ResolverConfig,
  type ResolveInput,
  type ResolveResult,
  type ModelCandidate,
  type ResolverLogger,
  type AgentModelConfig,
} from '../src/model-resolver.js';
import type { ProviderHealthCache, HealthState, ProviderHealthStatus } from '../src/provider-health-cache.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeHealthState(
  providerId: string,
  status: ProviderHealthStatus = 'HEALTHY',
  overrides?: Partial<HealthState>,
): HealthState {
  return {
    providerId,
    status,
    avgLatencyMs: 50,
    latencySamples: [50],
    lastCheckedAt: Date.now(),
    cachedAt: Date.now(),
    ...overrides,
  };
}

function makeMockHealthCache(
  statuses: Map<string, HealthState> = new Map(),
): ProviderHealthCache {
  return {
    getStatus: vi.fn((id: string) => statuses.get(id)),
    getAllStatuses: vi.fn(() => statuses),
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => true),
    refreshAll: vi.fn(async () => {}),
  } as unknown as ProviderHealthCache;
}

function makeModelCatalog(...entries: ModelCandidate[]): ReadonlyMap<string, ModelCandidate> {
  const map = new Map<string, ModelCandidate>();
  for (const e of entries) map.set(e.modelId, e);
  return map;
}

function makeConfig(overrides?: Partial<ResolverConfig>): ResolverConfig {
  return {
    enabled: true,
    timeoutMs: 500,
    modelCatalog: makeModelCatalog(
      { modelId: 'claude-opus-4', providerId: 'anthropic', tier: 'premium' },
      { modelId: 'claude-sonnet-4', providerId: 'anthropic', tier: 'standard' },
      { modelId: 'gpt-4.1', providerId: 'openai-codex', tier: 'standard' },
      { modelId: 'copilot-gpt', providerId: 'github-copilot', tier: 'economy' },
    ),
    tierMapping: { ...DEFAULT_TIER_MAPPING },
    ...overrides,
  };
}

function makeInput(overrides?: Partial<ResolveInput>): ResolveInput {
  return {
    agentId: 'back-1',
    correlationId: 'test-correlation-id',
    agentModelConfig: {
      primary: 'claude-opus-4',
      fallbacks: ['gpt-4.1', 'copilot-gpt'],
    },
    ...overrides,
  };
}

function makeLogger(): ResolverLogger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('createModelResolver', () => {
  let healthCache: ProviderHealthCache;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.resetAllMocks();
    const statuses = new Map<string, HealthState>();
    statuses.set('anthropic', makeHealthState('anthropic', 'HEALTHY'));
    statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
    statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
    healthCache = makeMockHealthCache(statuses);
    logger = makeLogger();
  });

  /* ---------------------------------------------------------------- */
  /*  Config gating (AC1)                                              */
  /* ---------------------------------------------------------------- */

  describe('config gating', () => {
    it('returns static fallback when dynamic routing is disabled', () => {
      const config = makeConfig({ enabled: false });
      const resolve = createModelResolver(healthCache, config, logger);
      const result = resolve(makeInput());

      expect(result.source).toBe('static-fallback');
      expect(result.reason).toBe('dynamic routing disabled');
      expect(result.modelId).toBe('claude-opus-4');
    });

    it('uses dynamic routing when enabled', () => {
      const config = makeConfig({ enabled: true });
      const resolve = createModelResolver(healthCache, config, logger);
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'back-1' },
      }));

      expect(result.source).toBe('dynamic');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Complexity-based routing (AC2, AC3)                              */
  /* ---------------------------------------------------------------- */

  describe('complexity-based routing', () => {
    it('routes low-complexity tasks to economy tier (AC2)', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // minor scope + IDEA stage + pm role = ~0 score = low tier
      const result = resolve(makeInput({
        complexityInput: { scope: 'minor', stage: 'IDEA', agentRole: 'pm' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('economy');
      expect(result.modelId).toBe('copilot-gpt');
    });

    it('routes high-complexity tasks to premium tier (AC3)', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // critical scope + IMPLEMENTATION stage + tech-lead role = 80+15+15=110 → capped 100 = high
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('premium');
      expect(result.modelId).toBe('claude-opus-4');
    });

    it('routes medium-complexity tasks to standard tier', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // major scope + DESIGN stage + designer role = 50+0+0 = 50 = medium
      const result = resolve(makeInput({
        complexityInput: { scope: 'major', stage: 'DESIGN', agentRole: 'designer' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('standard');
    });

    it('defaults to minor scope when no complexity input given', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // No complexity input → minor scope → score 20 → low tier → economy
      const result = resolve(makeInput({ complexityInput: undefined }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('economy');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Provider health failover (AC4)                                   */
  /* ---------------------------------------------------------------- */

  describe('provider health failover', () => {
    it('falls back to healthy provider when primary is DOWN (AC4)', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
      healthCache = makeMockHealthCache(statuses);

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // High complexity wants premium (anthropic) but it's DOWN
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      // Should pick a fallback since anthropic is DOWN
      expect(result.providerId).not.toBe('anthropic');
    });

    it('uses DEGRADED providers (treats only DOWN as unusable)', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DEGRADED'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
      healthCache = makeMockHealthCache(statuses);

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.modelId).toBe('claude-opus-4');
      expect(result.providerId).toBe('anthropic');
    });

    it('treats unchecked providers as usable (optimistic)', () => {
      // Empty health cache — no providers have been checked yet
      healthCache = makeMockHealthCache(new Map());

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.modelId).toBe('claude-opus-4');
    });

    it('falls to static when all providers are DOWN', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'DOWN'));
      healthCache = makeMockHealthCache(statuses);

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput());

      expect(result.source).toBe('static-fallback');
      expect(result.reason).toBe('no healthy model found at any tier');
    });

    it('prefers agent primary model when healthy at desired tier', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // High complexity → premium tier → should prefer primary (claude-opus-4)
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
        agentModelConfig: { primary: 'claude-opus-4', fallbacks: ['gpt-4.1'] },
      }));

      expect(result.modelId).toBe('claude-opus-4');
    });

    it('prefers agent fallback models before catalog models at same tier', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
      healthCache = makeMockHealthCache(statuses);

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // Medium complexity → standard tier → primary (opus) is premium so skip,
      // fallback gpt-4.1 is standard and healthy
      const result = resolve(makeInput({
        complexityInput: { scope: 'major', stage: 'DESIGN', agentRole: 'designer' },
        agentModelConfig: { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      }));

      expect(result.modelId).toBe('gpt-4.1');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Error fallback (AC5)                                             */
  /* ---------------------------------------------------------------- */

  describe('error fallback', () => {
    it('falls back to static routing when scorer throws', () => {
      // Force an error by passing a config with a catalog that throws on iteration
      const brokenCatalog = {
        get: () => undefined,
        [Symbol.iterator]: () => { throw new Error('catalog exploded'); },
      } as unknown as ReadonlyMap<string, ModelCandidate>;

      const config = makeConfig({ modelCatalog: brokenCatalog });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput());

      expect(result.source).toBe('static-fallback');
      expect(result.reason).toContain('resolver error');
    });

    it('falls back when health cache throws on getStatus', () => {
      const brokenCache = {
        getStatus: vi.fn(() => { throw new Error('cache exploded'); }),
        getAllStatuses: vi.fn(() => new Map()),
        start: vi.fn(),
        stop: vi.fn(),
        isRunning: vi.fn(() => true),
        refreshAll: vi.fn(async () => {}),
      } as unknown as ProviderHealthCache;

      const config = makeConfig();
      const resolve = createModelResolver(brokenCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('static-fallback');
      expect(result.reason).toContain('resolver error');
    });

    it('uses agent primary model ID in static fallback', () => {
      const config = makeConfig({ enabled: false });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        agentModelConfig: { primary: 'gpt-4.1' },
      }));

      expect(result.modelId).toBe('gpt-4.1');
    });

    it('uses "unknown" when no agent model config provided in fallback', () => {
      const config = makeConfig({ enabled: false });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({ agentModelConfig: undefined }));

      expect(result.modelId).toBe('unknown');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Structured logging (AC6)                                         */
  /* ---------------------------------------------------------------- */

  describe('structured logging', () => {
    it('logs dynamic resolution to info', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(logger.info).toHaveBeenCalledTimes(1);
      const msg = logger.info.mock.calls[0][0] as string;
      expect(msg).toContain('model-resolver:');
      expect(msg).toContain('test-correlation-id');
      expect(msg).toContain('dynamic');
    });

    it('logs static fallback to warn', () => {
      const config = makeConfig({ enabled: false });
      const resolve = createModelResolver(healthCache, config, logger);

      resolve(makeInput());

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const msg = logger.warn.mock.calls[0][0] as string;
      expect(msg).toContain('static-fallback');
      expect(msg).toContain('test-correlation-id');
    });

    it('generates a correlation ID when none provided', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({ correlationId: undefined }));

      expect(result.correlationId).toBeTruthy();
      expect(result.correlationId).toMatch(/^mr-/);
    });

    it('includes resolve time in result', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput());

      expect(typeof result.resolveTimeMs).toBe('number');
      expect(result.resolveTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('does not throw when logger is undefined', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, undefined);

      expect(() => resolve(makeInput())).not.toThrow();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Budget-aware downgrade (placeholder for EP11)                    */
  /* ---------------------------------------------------------------- */

  describe('budget-aware downgrade', () => {
    it('downgrades tier when budget remaining < 20%', () => {
      const config = makeConfig({ budgetRemainingFraction: 0.15 });
      const resolve = createModelResolver(healthCache, config, logger);

      // Would normally be high → premium, but budget downgrades to standard
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('standard');
    });

    it('does not downgrade when budget remaining >= 20%', () => {
      const config = makeConfig({ budgetRemainingFraction: 0.5 });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('premium');
    });

    it('does not downgrade when budget fraction is not set', () => {
      const config = makeConfig({ budgetRemainingFraction: undefined });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.tier).toBe('premium');
    });

    it('downgrades economy tier to economy (floor)', () => {
      const config = makeConfig({ budgetRemainingFraction: 0.1 });
      const resolve = createModelResolver(healthCache, config, logger);

      // Low complexity → economy → downgrade → still economy
      const result = resolve(makeInput({
        complexityInput: { scope: 'minor', stage: 'IDEA', agentRole: 'pm' },
      }));

      expect(result.tier).toBe('economy');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Tier search order                                                */
  /* ---------------------------------------------------------------- */

  describe('tier search order', () => {
    it('searches desired tier first, then falls through other tiers', () => {
      // Only economy model is healthy
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
      healthCache = makeMockHealthCache(statuses);

      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      // High complexity → wants premium, but only economy is healthy
      const result = resolve(makeInput({
        complexityInput: { scope: 'critical', stage: 'IMPLEMENTATION', agentRole: 'tech-lead' },
      }));

      expect(result.source).toBe('dynamic');
      expect(result.tier).toBe('economy');
      expect(result.modelId).toBe('copilot-gpt');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Result shape                                                     */
  /* ---------------------------------------------------------------- */

  describe('result shape', () => {
    it('includes all required fields in dynamic result', () => {
      const config = makeConfig();
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput({
        complexityInput: { scope: 'major', stage: 'IMPLEMENTATION', agentRole: 'back-1' },
      }));

      expect(result).toHaveProperty('modelId');
      expect(result).toHaveProperty('providerId');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('correlationId');
      expect(result).toHaveProperty('resolveTimeMs');
      expect(result.complexity).toHaveProperty('score');
      expect(result.complexity).toHaveProperty('tier');
      expect(result.complexity).toHaveProperty('factors');
    });

    it('includes all required fields in static fallback result', () => {
      const config = makeConfig({ enabled: false });
      const resolve = createModelResolver(healthCache, config, logger);

      const result = resolve(makeInput());

      expect(result.modelId).toBe('claude-opus-4');
      expect(result.providerId).toBe('static');
      expect(result.tier).toBe('standard');
      expect(result.source).toBe('static-fallback');
      expect(result.reason).toBeTruthy();
      expect(result.correlationId).toBe('test-correlation-id');
      expect(typeof result.resolveTimeMs).toBe('number');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  DEFAULT_TIER_MAPPING                                               */
/* ------------------------------------------------------------------ */

describe('DEFAULT_TIER_MAPPING', () => {
  it('maps low complexity to economy tier', () => {
    expect(DEFAULT_TIER_MAPPING.low).toBe('economy');
  });

  it('maps medium complexity to standard tier', () => {
    expect(DEFAULT_TIER_MAPPING.medium).toBe('standard');
  });

  it('maps high complexity to premium tier', () => {
    expect(DEFAULT_TIER_MAPPING.high).toBe('premium');
  });
});
