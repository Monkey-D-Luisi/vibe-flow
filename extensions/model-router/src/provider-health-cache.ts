/**
 * Provider Health Cache
 *
 * In-memory cache for provider health status with background refresh,
 * rolling latency tracking, stale-while-revalidate on TTL expiry,
 * and status change event emission.
 *
 * EP10 Task 0080
 */

import { checkProvider, PROVIDERS, TIMEOUT_MS } from './provider-health.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Provider health status enum. */
export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** Snapshot of a single provider's health state. */
export interface HealthState {
  /** Provider identifier (e.g. 'anthropic', 'openai-codex'). */
  providerId: string;
  /** Current health status. */
  status: ProviderHealthStatus;
  /** Rolling average latency in ms over the last N checks. */
  avgLatencyMs: number;
  /** Raw latency samples (most recent last). */
  latencySamples: number[];
  /** Timestamp of the last health check attempt (epoch ms), whether it succeeded or failed. */
  lastCheckedAt: number;
  /** Timestamp when the cache entry was written (epoch ms). */
  cachedAt: number;
  /** Last error message, if any. */
  lastError?: string;
}

/** Configuration for the ProviderHealthCache. */
export interface ProviderHealthCacheConfig {
  /** Time-to-live for cache entries in milliseconds. Default: 60_000 (60s). */
  ttlMs: number;
  /** Interval between background health checks in milliseconds. Default: 120_000 (120s). */
  checkIntervalMs: number;
  /** Number of latency samples to keep for rolling average. Default: 10. */
  maxLatencySamples: number;
  /** Timeout per provider health check in milliseconds. Defaults to TIMEOUT_MS from provider-health.ts. */
  checkTimeoutMs: number;
  /** Fraction of checkTimeoutMs above which a connected provider is considered DEGRADED. Default: 0.8. */
  degradedThreshold: number;
}

/** Event emitted when a provider's health status changes. */
export interface HealthStatusChangeEvent {
  providerId: string;
  previousStatus: ProviderHealthStatus;
  newStatus: ProviderHealthStatus;
  avgLatencyMs: number;
  timestamp: number;
}

/** Callback for status change events. */
export type OnStatusChange = (event: HealthStatusChangeEvent) => void;

/** Provider check function signature (injectable for testing). */
export type CheckProviderFn = (
  url: string,
  authHeaders: Record<string, string>,
) => Promise<{ connected: boolean; latencyMs: number; error?: string }>;

/** Provider definition matching the shape from provider-health.ts. */
export interface ProviderDef {
  id: string;
  url: string;
  authHeaders: () => Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_CACHE_CONFIG: Readonly<ProviderHealthCacheConfig> = {
  ttlMs: 60_000,
  checkIntervalMs: 120_000,
  maxLatencySamples: 10,
  checkTimeoutMs: TIMEOUT_MS,
  degradedThreshold: 0.8,
};

/* ------------------------------------------------------------------ */
/*  Implementation                                                     */
/* ------------------------------------------------------------------ */

function deriveStatus(
  connected: boolean,
  avgLatencyMs: number,
  checkTimeoutMs: number,
  degradedThreshold: number,
): ProviderHealthStatus {
  if (!connected) return 'DOWN';
  if (avgLatencyMs > checkTimeoutMs * degradedThreshold) return 'DEGRADED';
  return 'HEALTHY';
}

function computeRollingAverage(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((a, b) => a + b, 0);
  return Math.round(sum / samples.length);
}

export class ProviderHealthCache {
  private readonly config: ProviderHealthCacheConfig;
  private readonly providers: ReadonlyArray<ProviderDef>;
  private readonly checkFn: CheckProviderFn;
  private readonly onStatusChange?: OnStatusChange;
  private readonly cache = new Map<string, HealthState>();
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingRefreshes = new Set<string>();

  constructor(options?: {
    config?: Partial<ProviderHealthCacheConfig>;
    providers?: ReadonlyArray<ProviderDef>;
    checkFn?: CheckProviderFn;
    onStatusChange?: OnStatusChange;
  }) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...options?.config };
    this.providers = options?.providers ?? PROVIDERS;
    this.checkFn = options?.checkFn ?? checkProvider;
    this.onStatusChange = options?.onStatusChange;
  }

  /**
   * Start the background health check loop. Runs an initial check immediately.
   *
   * Uses setTimeout-based scheduling to prevent overlapping executions:
   * the next check is only scheduled after the current one completes.
   */
  start(): void {
    if (this.timeoutHandle !== null) return; // already running
    this.scheduleNext(0); // immediate first check
  }

  /** Stop the background health check loop. */
  stop(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /** Whether the background loop is running. */
  isRunning(): boolean {
    return this.timeoutHandle !== null;
  }

  /**
   * Get the cached health state for a specific provider.
   *
   * If the entry exists but TTL has expired, returns the stale entry
   * and triggers an async refresh (stale-while-revalidate).
   *
   * Returns `undefined` if the provider has never been checked.
   */
  getStatus(providerId: string): HealthState | undefined {
    const entry = this.cache.get(providerId);
    if (!entry) return undefined;

    // Check TTL — if expired, trigger async refresh but return stale data
    const age = Date.now() - entry.cachedAt;
    if (age > this.config.ttlMs) {
      this.triggerAsyncRefresh(providerId);
    }

    return entry;
  }

  /**
   * Get all cached provider health states.
   *
   * Side effect: triggers async refresh for any entries past TTL
   * (stale-while-revalidate). Callers always get a synchronous return.
   */
  getAllStatuses(): ReadonlyMap<string, HealthState> {
    const now = Date.now();
    for (const [id, entry] of this.cache) {
      if (now - entry.cachedAt > this.config.ttlMs) {
        this.triggerAsyncRefresh(id);
      }
    }
    return this.cache;
  }

  /** Refresh all providers. Public for testing. */
  async refreshAll(): Promise<void> {
    const promises = this.providers.map(p => this.refreshProvider(p));
    await Promise.all(promises);
  }

  /** Schedule the next background refresh after delayMs. */
  private scheduleNext(delayMs: number): void {
    this.timeoutHandle = setTimeout(async () => {
      await this.refreshAll();
      // Only schedule next if still running (not stopped during refresh)
      if (this.timeoutHandle !== null) {
        this.scheduleNext(this.config.checkIntervalMs);
      }
    }, delayMs);
    // Unref so the timer doesn't keep the process alive during shutdown
    if (typeof this.timeoutHandle === 'object' && 'unref' in this.timeoutHandle) {
      this.timeoutHandle.unref();
    }
  }

  /** Refresh a single provider by ID. */
  private async refreshProvider(provider: ProviderDef): Promise<void> {
    const now = Date.now();
    const existing = this.cache.get(provider.id);

    let connected: boolean;
    let latencyMs: number;
    let error: string | undefined;

    try {
      const result = await this.checkFn(provider.url, provider.authHeaders());
      connected = result.connected;
      latencyMs = result.latencyMs;
      error = result.error;
    } catch (err: unknown) {
      // On check exception, mark as DOWN with timeout-length penalty sample.
      // This is not "last-known-good" — exceptions are treated as failures
      // so the model resolver can route away from this provider.
      connected = false;
      latencyMs = this.config.checkTimeoutMs;
      error = err instanceof Error ? err.message : String(err);
    }

    // Update latency samples
    const samples = existing ? [...existing.latencySamples] : [];
    samples.push(latencyMs);
    if (samples.length > this.config.maxLatencySamples) {
      samples.splice(0, samples.length - this.config.maxLatencySamples);
    }

    const avgLatencyMs = computeRollingAverage(samples);
    const newStatus = deriveStatus(connected, avgLatencyMs, this.config.checkTimeoutMs, this.config.degradedThreshold);
    const previousStatus = existing?.status;

    const state: HealthState = {
      providerId: provider.id,
      status: newStatus,
      avgLatencyMs,
      latencySamples: samples,
      lastCheckedAt: now,
      cachedAt: now,
      lastError: error,
    };

    this.cache.set(provider.id, state);

    // Emit status change event
    if (previousStatus !== undefined && previousStatus !== newStatus && this.onStatusChange) {
      this.onStatusChange({
        providerId: provider.id,
        previousStatus,
        newStatus,
        avgLatencyMs,
        timestamp: now,
      });
    }
  }

  /** Trigger a non-blocking refresh for a single provider (stale-while-revalidate). */
  private triggerAsyncRefresh(providerId: string): void {
    if (this.pendingRefreshes.has(providerId)) return; // already refreshing
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) return;

    this.pendingRefreshes.add(providerId);
    void this.refreshProvider(provider).finally(() => {
      this.pendingRefreshes.delete(providerId);
    });
  }
}
