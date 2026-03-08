import { describe, it, expect, vi } from 'vitest';
import {
  resolveFallbackChain,
  DEFAULT_COPILOT_PROXY_PROVIDER_ID,
} from '../src/fallback-chain.js';
import type { ModelCandidate } from '../src/model-resolver.js';
import type { ProviderHealthCache, HealthState, ProviderHealthStatus } from '../src/provider-health-cache.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeHealthState(
  providerId: string,
  status: ProviderHealthStatus = 'HEALTHY',
): HealthState {
  return {
    providerId,
    status,
    avgLatencyMs: 50,
    latencySamples: [50],
    lastCheckedAt: Date.now(),
    cachedAt: Date.now(),
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

const STANDARD_CATALOG = makeModelCatalog(
  { modelId: 'claude-opus-4', providerId: 'anthropic', tier: 'premium' },
  { modelId: 'claude-sonnet-4', providerId: 'anthropic', tier: 'standard' },
  { modelId: 'gpt-4.1', providerId: 'openai-codex', tier: 'standard' },
  { modelId: 'copilot-gpt', providerId: 'github-copilot', tier: 'economy' },
  { modelId: 'copilot-gpt4o', providerId: 'github-copilot', tier: 'economy' },
);

function allHealthy(): ProviderHealthCache {
  const statuses = new Map<string, HealthState>();
  statuses.set('anthropic', makeHealthState('anthropic', 'HEALTHY'));
  statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
  statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));
  return makeMockHealthCache(statuses);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('resolveFallbackChain', () => {
  /* ---------------------------------------------------------------- */
  /*  Primary model selection                                          */
  /* ---------------------------------------------------------------- */

  describe('primary model', () => {
    it('selects primary model when healthy', () => {
      const result = resolveFallbackChain(
        allHealthy(),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      expect(result.model).toBeDefined();
      expect(result.model!.modelId).toBe('claude-opus-4');
      expect(result.fallbackLevel).toBe('primary');
      expect(result.chain).toHaveLength(1);
      expect(result.chain[0].selected).toBe(true);
    });

    it('skips primary when provider is DOWN', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      expect(result.model).toBeDefined();
      expect(result.model!.modelId).toBe('gpt-4.1');
      expect(result.fallbackLevel).toBe('configured-fallback');
      expect(result.chain[0].modelId).toBe('claude-opus-4');
      expect(result.chain[0].selected).toBe(false);
      expect(result.chain[0].skipReason).toBe('provider-down');
    });

    it('treats DEGRADED primary as usable', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DEGRADED'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4' },
      );

      expect(result.model!.modelId).toBe('claude-opus-4');
      expect(result.fallbackLevel).toBe('primary');
    });

    it('treats unchecked primary as usable (optimistic)', () => {
      const result = resolveFallbackChain(
        makeMockHealthCache(new Map()),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4' },
      );

      expect(result.model!.modelId).toBe('claude-opus-4');
      expect(result.fallbackLevel).toBe('primary');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Configured fallbacks                                             */
  /* ---------------------------------------------------------------- */

  describe('configured fallbacks', () => {
    it('tries fallbacks in declared order', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['claude-sonnet-4', 'gpt-4.1', 'copilot-gpt'] },
      );

      // claude-sonnet-4 is anthropic (DOWN), so should skip to gpt-4.1
      expect(result.model!.modelId).toBe('gpt-4.1');
      expect(result.chain).toHaveLength(3); // primary + sonnet + gpt-4.1
    });

    it('skips fallback not in catalog', () => {
      const result = resolveFallbackChain(
        allHealthy(),
        STANDARD_CATALOG,
        { primary: 'nonexistent-model', fallbacks: ['also-nonexistent', 'gpt-4.1'] },
      );

      expect(result.model!.modelId).toBe('gpt-4.1');
      expect(result.chain[0].skipReason).toBe('not-in-catalog');
      expect(result.chain[1].skipReason).toBe('not-in-catalog');
      expect(result.chain[2].selected).toBe(true);
    });

    it('labels copilot in configured fallbacks as configured-fallback level', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      expect(result.model!.modelId).toBe('copilot-gpt');
      // Configured copilot fallbacks use 'configured-fallback', not 'copilot-proxy'
      expect(result.fallbackLevel).toBe('configured-fallback');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Copilot-proxy injection                                          */
  /* ---------------------------------------------------------------- */

  describe('copilot-proxy injection', () => {
    it('injects copilot-proxy when all configured fallbacks exhausted', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      // Agent does not have copilot in its fallback list
      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1'] },
      );

      expect(result.model!.modelId).toBe('copilot-gpt');
      expect(result.model!.providerId).toBe('github-copilot');
      expect(result.fallbackLevel).toBe('copilot-proxy');
      expect(result.reason).toContain('copilot-proxy fallback');
      expect(result.reason).toContain('all configured models exhausted');
    });

    it('does not re-try copilot models already in configured fallbacks', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      // copilot-gpt is already in fallbacks, so injection should only add copilot-gpt4o
      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      // copilot-gpt is picked from configured fallbacks (not injection)
      expect(result.model!.modelId).toBe('copilot-gpt');
      expect(result.fallbackLevel).toBe('configured-fallback');

      // Verify no duplicate copilot-gpt in the chain
      const copilotGptAttempts = result.chain.filter(a => a.modelId === 'copilot-gpt');
      expect(copilotGptAttempts).toHaveLength(1);
    });

    it('injects only copilot models not already in configured fallbacks', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'DOWN'));

      const catalog = makeModelCatalog(
        { modelId: 'claude-opus-4', providerId: 'anthropic', tier: 'premium' },
        { modelId: 'gpt-4.1', providerId: 'openai-codex', tier: 'standard' },
        { modelId: 'copilot-gpt', providerId: 'github-copilot', tier: 'economy' },
        { modelId: 'copilot-gpt4o', providerId: 'github-copilot', tier: 'economy' },
      );

      // copilot-gpt is in configured fallbacks; injection should add only copilot-gpt4o
      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        catalog,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      // All DOWN, but chain should include copilot-gpt4o from injection (not copilot-gpt again)
      expect(result.model).toBeUndefined();
      const injectedIds = result.chain.map(a => a.modelId);
      // copilot-gpt appears once (from configured), copilot-gpt4o once (from injection)
      expect(injectedIds.filter(id => id === 'copilot-gpt')).toHaveLength(1);
      expect(injectedIds.filter(id => id === 'copilot-gpt4o')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  All providers DOWN                                               */
  /* ---------------------------------------------------------------- */

  describe('all providers DOWN', () => {
    it('returns undefined model when all candidates exhausted', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'DOWN'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1', 'copilot-gpt'] },
      );

      expect(result.model).toBeUndefined();
      expect(result.fallbackLevel).toBeUndefined();
      expect(result.reason).toContain('candidates exhausted');
      expect(result.reason).toContain('provider-down');
    });

    it('includes full chain in exhausted result', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'DOWN'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1'] },
      );

      // primary + gpt-4.1 + copilot-gpt + copilot-gpt4o (injected)
      expect(result.chain.length).toBeGreaterThanOrEqual(3);
      expect(result.chain.every(a => !a.selected)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge cases                                                       */
  /* ---------------------------------------------------------------- */

  describe('edge cases', () => {
    it('works with no agent model config', () => {
      const result = resolveFallbackChain(
        allHealthy(),
        STANDARD_CATALOG,
        undefined,
      );

      // Should try copilot-proxy injection as there's no primary/fallbacks
      // All copilot models are healthy
      expect(result.model).toBeDefined();
      expect(result.model!.providerId).toBe('github-copilot');
      expect(result.fallbackLevel).toBe('copilot-proxy');
    });

    it('works with empty fallbacks array', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('github-copilot', makeHealthState('github-copilot', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: [] },
      );

      expect(result.model).toBeDefined();
      expect(result.model!.providerId).toBe('github-copilot');
      expect(result.fallbackLevel).toBe('copilot-proxy');
    });

    it('works with empty catalog', () => {
      const result = resolveFallbackChain(
        allHealthy(),
        makeModelCatalog(),
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1'] },
      );

      expect(result.model).toBeUndefined();
      expect(result.chain[0].skipReason).toBe('not-in-catalog');
      expect(result.chain[1].skipReason).toBe('not-in-catalog');
    });

    it('respects custom copilot-proxy provider ID', () => {
      const catalog = makeModelCatalog(
        { modelId: 'opus', providerId: 'anthropic', tier: 'premium' },
        { modelId: 'custom-copilot', providerId: 'my-copilot', tier: 'economy' },
      );

      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('my-copilot', makeHealthState('my-copilot', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        catalog,
        { primary: 'opus' },
        { copilotProxyProviderId: 'my-copilot' },
      );

      expect(result.model!.modelId).toBe('custom-copilot');
      expect(result.fallbackLevel).toBe('copilot-proxy');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Chain logging                                                    */
  /* ---------------------------------------------------------------- */

  describe('chain logging', () => {
    it('records provider status for each attempt', () => {
      const statuses = new Map<string, HealthState>();
      statuses.set('anthropic', makeHealthState('anthropic', 'DOWN'));
      statuses.set('openai-codex', makeHealthState('openai-codex', 'HEALTHY'));

      const result = resolveFallbackChain(
        makeMockHealthCache(statuses),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4', fallbacks: ['gpt-4.1'] },
      );

      expect(result.chain[0].providerStatus).toBe('DOWN');
      expect(result.chain[1].providerStatus).toBe('HEALTHY');
    });

    it('records undefined status for unchecked providers', () => {
      const result = resolveFallbackChain(
        makeMockHealthCache(new Map()),
        STANDARD_CATALOG,
        { primary: 'claude-opus-4' },
      );

      expect(result.chain[0].providerStatus).toBeUndefined();
    });

    it('records not-in-catalog with undefined providerId', () => {
      const result = resolveFallbackChain(
        allHealthy(),
        STANDARD_CATALOG,
        { primary: 'nonexistent' },
      );

      expect(result.chain[0].providerId).toBeUndefined();
      expect(result.chain[0].skipReason).toBe('not-in-catalog');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  DEFAULT_COPILOT_PROXY_PROVIDER_ID                                */
  /* ---------------------------------------------------------------- */

  describe('DEFAULT_COPILOT_PROXY_PROVIDER_ID', () => {
    it('defaults to github-copilot', () => {
      expect(DEFAULT_COPILOT_PROXY_PROVIDER_ID).toBe('github-copilot');
    });
  });
});
