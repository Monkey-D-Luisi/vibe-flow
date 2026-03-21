/**
 * Budget Query HTTP Handlers
 *
 * Exposes budget data via HTTP endpoints so other plugins (e.g. telegram-notifier)
 * can query and mutate budget records without accessing the DB directly.
 *
 * EP13 Task 0096
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface BudgetQueryDeps {
  readonly getByScope: (scope: string, scopeId: string) => unknown;
  readonly listByScope: (scope: string) => unknown[];
  readonly replenish: (
    id: string,
    additionalTokens: number,
    additionalUsd: number,
    expectedRev: number,
    now: string,
  ) => unknown;
  readonly resetConsumption: (id: string, expectedRev: number, now: string) => unknown;
  readonly now: () => string;
}

const MAX_BODY_BYTES = 65_536;

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function createBudgetQueryHandler(
  deps: BudgetQueryDeps,
): (req: IncomingMessage, res: ServerResponse) => void | Promise<void> {
  return async (req, res) => {
    const baseUrl = `http://localhost${req.url ?? '/'}`;
    const url = new URL(baseUrl);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/budget') {
      const scope = url.searchParams.get('scope');
      const scopeId = url.searchParams.get('scopeId');

      if (!scope) {
        sendJson(res, 400, { error: 'Missing required query parameter: scope' });
        return;
      }

      if (scopeId) {
        const record = deps.getByScope(scope, scopeId);
        sendJson(res, 200, { record: record ?? null });
      } else {
        const records = deps.listByScope(scope);
        sendJson(res, 200, { records });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/budget/replenish') {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'payload_too_large') {
          sendJson(res, 413, { error: 'Payload too large' });
          return;
        }
        throw err;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const id = typeof body['id'] === 'string' ? body['id'] : '';
      const additionalTokens = typeof body['additionalTokens'] === 'number' ? body['additionalTokens'] : NaN;
      const additionalUsd = typeof body['additionalUsd'] === 'number' ? body['additionalUsd'] : NaN;
      const expectedRev = typeof body['expectedRev'] === 'number' ? body['expectedRev'] : NaN;

      if (!id) {
        sendJson(res, 400, { error: 'Missing required field: id' });
        return;
      }

      if (!Number.isFinite(additionalTokens) || additionalTokens < 0 ||
          !Number.isFinite(additionalUsd) || additionalUsd < 0 ||
          !Number.isFinite(expectedRev) || expectedRev < 0) {
        sendJson(res, 400, { error: 'additionalTokens, additionalUsd, and expectedRev must be finite non-negative numbers' });
        return;
      }

      try {
        const updated = deps.replenish(id, additionalTokens, additionalUsd, expectedRev, deps.now());
        sendJson(res, 200, { record: updated });
      } catch (err: unknown) {
        sendJson(res, 409, { error: String(err) });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/budget/reset') {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'payload_too_large') {
          sendJson(res, 413, { error: 'Payload too large' });
          return;
        }
        throw err;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const id = typeof body['id'] === 'string' ? body['id'] : '';
      const expectedRev = typeof body['expectedRev'] === 'number' ? body['expectedRev'] : NaN;

      if (!id) {
        sendJson(res, 400, { error: 'Missing required field: id' });
        return;
      }

      if (!Number.isFinite(expectedRev) || expectedRev < 0) {
        sendJson(res, 400, { error: 'expectedRev must be a finite non-negative number' });
        return;
      }

      try {
        const updated = deps.resetConsumption(id, expectedRev, deps.now());
        sendJson(res, 200, { record: updated });
      } catch (err: unknown) {
        sendJson(res, 409, { error: String(err) });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  };
}
