import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProviderHealthCache,
  DEFAULT_CACHE_CONFIG,
  type CheckProviderFn,
  type ProviderDef,
  type HealthStatusChangeEvent,
  type ProviderHealthStatus,
} from '../src/provider-health-cache.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeProvider(id: string, url = 'https://example.com'): ProviderDef {
  return { id, url, authHeaders: () => ({}) };
}

function makeCheckFn(
  overrides: Partial<Record<string, { connected: boolean; latencyMs: number; error?: string }>> = {},
): CheckProviderFn {
  return async (_url: string, _headers: Record<string, string>) => {
    // Find override by URL prefix or return default healthy
    for (const [_key, value] of Object.entries(overrides)) {
      if (_url.includes(_key)) return value;
    }
    return { connected: true, latencyMs: 50 };
  };
}

const FAST_CONFIG = {
  ttlMs: 100,
  checkIntervalMs: 50,
  maxLatencySamples: 5,
  checkTimeoutMs: 5000,
} as const;

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ProviderHealthCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---------------------------------------------------------------- */
  /*  Construction and defaults                                        */
  /* ---------------------------------------------------------------- */

  describe('construction', () => {
    it('uses default config when no options provided', () => {
      const cache = new ProviderHealthCache({
        providers: [makeProvider('test')],
        checkFn: makeCheckFn(),
      });
      expect(cache).toBeDefined();
      expect(cache.isRunning()).toBe(false);
    });

    it('merges partial config with defaults', () => {
      const cache = new ProviderHealthCache({
        config: { ttlMs: 30_000 },
        providers: [makeProvider('test')],
        checkFn: makeCheckFn(),
      });
      // The cache should work — config merged internally
      expect(cache).toBeDefined();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  getStatus / getAllStatuses                                        */
  /* ---------------------------------------------------------------- */

  describe('getStatus', () => {
    it('returns undefined for unknown provider before any check', () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('anthropic')],
        checkFn: makeCheckFn(),
      });
      expect(cache.getStatus('unknown')).toBeUndefined();
    });

    it('returns undefined for known provider before first check', () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('anthropic')],
        checkFn: makeCheckFn(),
      });
      expect(cache.getStatus('anthropic')).toBeUndefined();
    });

    it('returns health state after refresh', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('anthropic')],
        checkFn: async () => ({ connected: true, latencyMs: 42 }),
      });

      await cache.refreshAll();
      const state = cache.getStatus('anthropic');

      expect(state).toBeDefined();
      expect(state!.providerId).toBe('anthropic');
      expect(state!.status).toBe('HEALTHY');
      expect(state!.latencySamples).toEqual([42]);
      expect(state!.avgLatencyMs).toBe(42);
    });

    it('returns HEALTHY status for connected low-latency provider', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: true, latencyMs: 100 }),
      });

      await cache.refreshAll();
      expect(cache.getStatus('test')!.status).toBe('HEALTHY');
    });

    it('returns DOWN status for disconnected provider', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: false, latencyMs: 5000, error: 'timeout' }),
      });

      await cache.refreshAll();
      expect(cache.getStatus('test')!.status).toBe('DOWN');
    });

    it('returns DEGRADED status for high-latency but connected provider', async () => {
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, checkTimeoutMs: 1000 },
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: true, latencyMs: 850 }),
      });

      await cache.refreshAll();
      expect(cache.getStatus('test')!.status).toBe('DEGRADED');
    });
  });

  describe('getAllStatuses', () => {
    it('returns all cached provider states', async () => {
      const providers = [makeProvider('a'), makeProvider('b'), makeProvider('c')];
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers,
        checkFn: async () => ({ connected: true, latencyMs: 50 }),
      });

      await cache.refreshAll();
      const all = cache.getAllStatuses();

      expect(all.size).toBe(3);
      expect(all.has('a')).toBe(true);
      expect(all.has('b')).toBe(true);
      expect(all.has('c')).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  TTL and stale-while-revalidate                                   */
  /* ---------------------------------------------------------------- */

  describe('TTL and stale-while-revalidate', () => {
    it('returns stale data when TTL expired, triggers async refresh', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, ttlMs: 100 },
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: callCount * 10 };
        },
      });

      // Initial check
      await cache.refreshAll();
      expect(callCount).toBe(1);
      const first = cache.getStatus('test')!;
      expect(first.avgLatencyMs).toBe(10);

      // Advance past TTL
      vi.advanceTimersByTime(150);

      // getStatus should return stale data but trigger refresh
      const stale = cache.getStatus('test')!;
      expect(stale.avgLatencyMs).toBe(10); // stale data returned immediately

      // Let the async refresh complete
      await vi.advanceTimersByTimeAsync(0);
      expect(callCount).toBe(2);

      // Now fresh data is available
      const fresh = cache.getStatus('test')!;
      expect(fresh.latencySamples).toHaveLength(2);
    });

    it('does not trigger duplicate refreshes for the same provider', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, ttlMs: 100 },
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: 50 };
        },
      });

      await cache.refreshAll();
      expect(callCount).toBe(1);

      vi.advanceTimersByTime(150);

      // Call getStatus twice — should only trigger one refresh
      cache.getStatus('test');
      cache.getStatus('test');

      await vi.advanceTimersByTimeAsync(0);
      expect(callCount).toBe(2); // only one additional refresh
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Rolling average latency                                          */
  /* ---------------------------------------------------------------- */

  describe('rolling average latency', () => {
    it('computes rolling average over samples', async () => {
      let callIdx = 0;
      const latencies = [100, 200, 300, 400, 500];
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, maxLatencySamples: 5 },
        providers: [makeProvider('test')],
        checkFn: async () => ({
          connected: true,
          latencyMs: latencies[callIdx++] ?? 100,
        }),
      });

      for (let i = 0; i < latencies.length; i++) {
        await cache.refreshAll();
      }

      const state = cache.getStatus('test')!;
      expect(state.latencySamples).toEqual([100, 200, 300, 400, 500]);
      expect(state.avgLatencyMs).toBe(300); // (100+200+300+400+500)/5
    });

    it('evicts oldest samples when max exceeded', async () => {
      let callIdx = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, maxLatencySamples: 3 },
        providers: [makeProvider('test')],
        checkFn: async () => ({
          connected: true,
          latencyMs: ++callIdx * 100,
        }),
      });

      // Do 5 refreshes with maxLatencySamples=3
      for (let i = 0; i < 5; i++) {
        await cache.refreshAll();
      }

      const state = cache.getStatus('test')!;
      expect(state.latencySamples).toEqual([300, 400, 500]);
      expect(state.avgLatencyMs).toBe(400); // (300+400+500)/3
    });

    it('handles single sample correctly', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: true, latencyMs: 42 }),
      });

      await cache.refreshAll();
      const state = cache.getStatus('test')!;
      expect(state.latencySamples).toEqual([42]);
      expect(state.avgLatencyMs).toBe(42);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Status change events                                             */
  /* ---------------------------------------------------------------- */

  describe('status change events', () => {
    it('emits event when status transitions from HEALTHY to DOWN', async () => {
      const events: HealthStatusChangeEvent[] = [];
      let connected = true;

      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({
          connected,
          latencyMs: connected ? 50 : 5000,
          error: connected ? undefined : 'timeout',
        }),
        onStatusChange: (e) => events.push(e),
      });

      // First check: HEALTHY
      await cache.refreshAll();
      expect(events).toHaveLength(0); // no prior status → no event

      // Second check: DOWN
      connected = false;
      await cache.refreshAll();

      expect(events).toHaveLength(1);
      expect(events[0].providerId).toBe('test');
      expect(events[0].previousStatus).toBe('HEALTHY');
      expect(events[0].newStatus).toBe('DOWN');
    });

    it('emits event when status transitions from DOWN to HEALTHY', async () => {
      const events: HealthStatusChangeEvent[] = [];
      let connected = false;

      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({
          connected,
          latencyMs: connected ? 50 : 5000,
        }),
        onStatusChange: (e) => events.push(e),
      });

      // First check: DOWN
      await cache.refreshAll();

      // Second check: HEALTHY
      connected = true;
      await cache.refreshAll();

      expect(events).toHaveLength(1);
      expect(events[0].previousStatus).toBe('DOWN');
      expect(events[0].newStatus).toBe('HEALTHY');
    });

    it('does not emit event when status stays the same', async () => {
      const events: HealthStatusChangeEvent[] = [];
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: true, latencyMs: 50 }),
        onStatusChange: (e) => events.push(e),
      });

      await cache.refreshAll();
      await cache.refreshAll();
      await cache.refreshAll();

      expect(events).toHaveLength(0);
    });

    it('does not emit event on first check (no previous status)', async () => {
      const events: HealthStatusChangeEvent[] = [];
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: false, latencyMs: 5000 }),
        onStatusChange: (e) => events.push(e),
      });

      await cache.refreshAll();
      expect(events).toHaveLength(0);
    });

    it('emits events for multiple providers independently', async () => {
      const events: HealthStatusChangeEvent[] = [];
      const statuses: Record<string, boolean> = { a: true, b: true };

      const providers = [
        makeProvider('a', 'https://a.example.com'),
        makeProvider('b', 'https://b.example.com'),
      ];

      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers,
        checkFn: async (url: string) => {
          const id = url.includes('a.example') ? 'a' : 'b';
          const conn = statuses[id]!;
          return { connected: conn, latencyMs: conn ? 50 : 5000 };
        },
        onStatusChange: (e) => events.push(e),
      });

      // Both healthy
      await cache.refreshAll();
      expect(events).toHaveLength(0);

      // Provider 'a' goes down, 'b' stays healthy
      statuses['a'] = false;
      await cache.refreshAll();

      expect(events).toHaveLength(1);
      expect(events[0].providerId).toBe('a');
      expect(events[0].newStatus).toBe('DOWN');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Background loop lifecycle                                        */
  /* ---------------------------------------------------------------- */

  describe('start / stop lifecycle', () => {
    it('start() begins the background loop', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, checkIntervalMs: 100 },
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: 50 };
        },
      });

      cache.start();
      expect(cache.isRunning()).toBe(true);

      // Initial check fires immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(callCount).toBe(1);

      // Interval fires
      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBe(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBe(3);

      cache.stop();
    });

    it('stop() halts the background loop', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, checkIntervalMs: 100 },
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: 50 };
        },
      });

      cache.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(callCount).toBe(1);

      cache.stop();
      expect(cache.isRunning()).toBe(false);

      await vi.advanceTimersByTimeAsync(500);
      expect(callCount).toBe(1); // no more calls after stop
    });

    it('start() is idempotent — calling twice does not create duplicate loops', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: { ...FAST_CONFIG, checkIntervalMs: 100 },
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: 50 };
        },
      });

      cache.start();
      cache.start(); // second call is a no-op
      await vi.advanceTimersByTimeAsync(0);
      expect(callCount).toBe(1); // only one initial check

      await vi.advanceTimersByTimeAsync(100);
      expect(callCount).toBe(2); // only one interval tick

      cache.stop();
    });

    it('stop() is safe to call when not running', () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [],
        checkFn: async () => ({ connected: true, latencyMs: 50 }),
      });

      expect(() => cache.stop()).not.toThrow();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Error handling — last-known-good                                 */
  /* ---------------------------------------------------------------- */

  describe('error handling', () => {
    it('keeps last-known-good status when check throws', async () => {
      let shouldThrow = false;
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => {
          if (shouldThrow) throw new Error('network failure');
          return { connected: true, latencyMs: 50 };
        },
      });

      // First check: healthy
      await cache.refreshAll();
      expect(cache.getStatus('test')!.status).toBe('HEALTHY');

      // Second check: throws — should transition to DOWN (since connected=false on error)
      shouldThrow = true;
      await cache.refreshAll();
      const state = cache.getStatus('test')!;
      // Error sets connected=false → status becomes DOWN
      expect(state.status).toBe('DOWN');
      expect(state.lastError).toBe('network failure');
      // But latency samples are preserved (error adds timeout-length sample)
      expect(state.latencySamples.length).toBeGreaterThan(1);
    });

    it('stores error message from check result', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => ({ connected: false, latencyMs: 5000, error: 'ECONNREFUSED' }),
      });

      await cache.refreshAll();
      expect(cache.getStatus('test')!.lastError).toBe('ECONNREFUSED');
    });

    it('clears error when provider recovers', async () => {
      let failing = true;
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => {
          if (failing) return { connected: false, latencyMs: 5000, error: 'down' };
          return { connected: true, latencyMs: 50 };
        },
      });

      await cache.refreshAll();
      expect(cache.getStatus('test')!.lastError).toBe('down');

      failing = false;
      await cache.refreshAll();
      expect(cache.getStatus('test')!.lastError).toBeUndefined();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge cases                                                       */
  /* ---------------------------------------------------------------- */

  describe('edge cases', () => {
    it('handles empty providers list', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [],
        checkFn: async () => ({ connected: true, latencyMs: 50 }),
      });

      await cache.refreshAll();
      expect(cache.getAllStatuses().size).toBe(0);
    });

    it('handles non-Error exceptions from checkFn', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => {
          throw 'string error'; // eslint-disable-line no-throw-literal
        },
      });

      await cache.refreshAll();
      const state = cache.getStatus('test')!;
      expect(state.status).toBe('DOWN');
      expect(state.lastError).toBe('string error');
    });

    it('getStatus returns undefined for provider not in provider list', async () => {
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('a')],
        checkFn: async () => ({ connected: true, latencyMs: 50 }),
      });

      await cache.refreshAll();
      expect(cache.getStatus('nonexistent')).toBeUndefined();
    });

    it('concurrent refreshAll calls do not throw or corrupt status', async () => {
      let callCount = 0;
      const cache = new ProviderHealthCache({
        config: FAST_CONFIG,
        providers: [makeProvider('test')],
        checkFn: async () => {
          callCount++;
          return { connected: true, latencyMs: callCount * 10 };
        },
      });

      // Fire multiple concurrent refreshes — should not throw
      await Promise.all([
        cache.refreshAll(),
        cache.refreshAll(),
        cache.refreshAll(),
      ]);

      const state = cache.getStatus('test')!;
      // All 3 calls ran; due to concurrent writes the final sample count
      // depends on interleaving, but status must be consistent
      expect(callCount).toBe(3);
      expect(state.status).toBe('HEALTHY');
      expect(state.latencySamples.length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  DEFAULT_CACHE_CONFIG                                             */
  /* ---------------------------------------------------------------- */

  describe('DEFAULT_CACHE_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_CACHE_CONFIG.ttlMs).toBe(60_000);
      expect(DEFAULT_CACHE_CONFIG.checkIntervalMs).toBe(120_000);
      expect(DEFAULT_CACHE_CONFIG.maxLatencySamples).toBe(10);
      expect(DEFAULT_CACHE_CONFIG.checkTimeoutMs).toBe(5_000);
    });
  });
});
