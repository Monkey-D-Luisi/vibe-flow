/**
 * Product-Team API Client
 *
 * Replaces direct _sharedDb access with HTTP calls to the product-team plugin's
 * registered HTTP routes. This decouples telegram-notifier from product-team's
 * internal database schema.
 *
 * EP13 Task 0096
 */

import http from 'node:http';

export interface ApiBudgetRecord {
  readonly id: string;
  scope: string;
  scopeId: string;
  limitTokens: number;
  consumedTokens: number;
  limitUsd: number;
  consumedUsd: number;
  status: string;
  warningThreshold: number;
  rev: number;
}

export interface ApiDecision {
  readonly id: string;
  category: string;
  question: string;
  approver: string | null;
  created_at: string;
}

/** Metrics response from GET /api/metrics (EP14). */
export interface ApiMetricsResponse {
  readonly timestamp: string;
  readonly system: { readonly status: string; readonly activePipelines: number };
  readonly agents: Record<string, { readonly eventsInPeriod: number }>;
  readonly pipeline: {
    readonly activeTasks: number;
    readonly stageDistribution: Record<string, number>;
  };
  readonly costs: {
    readonly totalTokens: number;
    readonly byAgent: Record<string, { inputTokens: number; outputTokens: number; calls: number }>;
  };
  readonly budget: {
    readonly globalConsumedUsd: number;
    readonly globalLimitUsd: number;
    readonly globalConsumedTokens: number;
    readonly globalLimitTokens: number;
  };
  readonly lastRefresh: string | null;
}

/** Stage timeline entry from GET /api/timeline. */
export interface ApiStageEntry {
  readonly stage: string;
  readonly enteredAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly agentId: string | null;
}

/** Timeline response for a single task or all active tasks (EP14). */
export interface ApiTimelineResponse {
  readonly timestamp: string;
  readonly activeTasks?: number;
  readonly timelines?: ReadonlyArray<{
    readonly taskId: string;
    readonly title: string;
    readonly currentStage: string;
    readonly stages: readonly ApiStageEntry[];
    readonly totalDurationMs: number | null;
  }>;
  readonly taskId?: string;
  readonly title?: string;
  readonly currentStage?: string;
  readonly stages?: readonly ApiStageEntry[];
  readonly totalDurationMs?: number | null;
}

/** Heatmap response from GET /api/metrics/heatmap (EP14). */
export interface ApiHeatmapResponse {
  readonly timestamp: string;
  readonly bucketMinutes: number;
  readonly since: string;
  readonly until: string;
  readonly agents: readonly string[];
  readonly buckets: ReadonlyArray<{
    readonly start: string;
    readonly counts: Record<string, number>;
  }>;
  readonly totals: Record<string, number>;
}

export interface ProductTeamApiClient {
  getBudgetByScope(scope: string, scopeId: string): Promise<ApiBudgetRecord | null>;
  listBudgetByScope(scope: string): Promise<ApiBudgetRecord[]>;
  replenishBudget(
    id: string,
    additionalTokens: number,
    additionalUsd: number,
    expectedRev: number,
    now: string,
  ): Promise<ApiBudgetRecord>;
  resetBudgetConsumption(id: string, expectedRev: number, now: string): Promise<ApiBudgetRecord>;
  listPendingDecisions(): Promise<ApiDecision[]>;
  approveDecision(decisionId: string, choice: string): Promise<{ approved: boolean }>;
  rejectDecision(decisionId: string, reason: string): Promise<{ rejected: boolean }>;
  getMetrics(period: 'hour' | 'day' | 'all'): Promise<ApiMetricsResponse>;
  getTimeline(taskId?: string): Promise<ApiTimelineResponse>;
  getHeatmap(bucketMinutes?: number): Promise<ApiHeatmapResponse>;
}

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: body
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
          : undefined,
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timed out: ${method} ${path}`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export function createApiClient(port: number): ProductTeamApiClient {
  async function get<T>(path: string): Promise<T> {
    const res = await httpRequest(port, 'GET', path);
    if (res.statusCode >= 400) {
      throw new Error(`API error ${res.statusCode}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  async function post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const res = await httpRequest(port, 'POST', path, JSON.stringify(payload));
    if (res.statusCode >= 400) {
      throw new Error(`API error ${res.statusCode}: ${res.body}`);
    }
    return JSON.parse(res.body) as T;
  }

  return {
    async getBudgetByScope(scope, scopeId) {
      const data = await get<{ record: ApiBudgetRecord | null }>(
        `/api/budget?scope=${encodeURIComponent(scope)}&scopeId=${encodeURIComponent(scopeId)}`,
      );
      return data.record;
    },

    async listBudgetByScope(scope) {
      const data = await get<{ records: ApiBudgetRecord[] }>(
        `/api/budget?scope=${encodeURIComponent(scope)}`,
      );
      return data.records;
    },

    async replenishBudget(id, additionalTokens, additionalUsd, expectedRev, _now) {
      const data = await post<{ record: ApiBudgetRecord }>('/api/budget/replenish', {
        id,
        additionalTokens,
        additionalUsd,
        expectedRev,
      });
      return data.record;
    },

    async resetBudgetConsumption(id, expectedRev, _now) {
      const data = await post<{ record: ApiBudgetRecord }>('/api/budget/reset', {
        id,
        expectedRev,
      });
      return data.record;
    },

    async listPendingDecisions() {
      const data = await get<{ decisions: ApiDecision[] }>('/api/decisions?status=pending');
      return data.decisions;
    },

    async approveDecision(decisionId, choice) {
      return post<{ approved: boolean }>('/api/decisions/approve', { decisionId, choice });
    },

    async rejectDecision(decisionId, reason) {
      return post<{ rejected: boolean }>('/api/decisions/reject', { decisionId, reason });
    },

    async getMetrics(period) {
      return get<ApiMetricsResponse>(
        `/api/metrics?period=${encodeURIComponent(period)}`,
      );
    },

    async getTimeline(taskId) {
      const qs = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
      return get<ApiTimelineResponse>(`/api/timeline${qs}`);
    },

    async getHeatmap(bucketMinutes) {
      const qs = bucketMinutes ? `?bucketMinutes=${bucketMinutes}` : '';
      return get<ApiHeatmapResponse>(`/api/metrics/heatmap${qs}`);
    },
  };
}
