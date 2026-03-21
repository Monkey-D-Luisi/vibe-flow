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
  };
}
